<?php
namespace App\Services\CloudComputer\Activity;

use App\Services\CloudComputer\Owners\OwnerInput;
use App\Services\CloudComputer\{Computers, ConnectConsent};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Ramsey\Uuid\Uuid;

/**
 * The Cloud Host's phase changes (docs/cloud-switching-contract.md section 2). Metadata only: provider, the
 * provider's conversation id, the synced project, a phase and the conversation's title (which may begin with the first
 * words of the person's first prompt; kept 7 days; never a message body). A store is idempotent per (provider, id, phase,
 * at), an event is always filed under the workspace's own owner, and an account keeps at most MAX_PER_USER rows.
 */
class HostEvents
{
    public const TABLE = 'cloud_host_events';
    /** `stopped` is the silent end: the conversation was interrupted, crashed or restored interrupted without finishing. */
    public const PHASES = ['running', 'waiting', 'finished', 'failed', 'stopped'];
    /** Phases the feed reports as events (a `running` change only moves the live list). `returned` comes from the sync side. */
    public const KINDS = ['waiting' => 'approval_needed', 'finished' => 'turn_finished', 'failed' => 'failed', 'returned' => 'returned'];
    public const RETENTION_DAYS = 7;
    public const MAX_BATCH = 100;
    /** Live rows per account; past it the oldest go on insert, so a runaway Host cannot grow the table. */
    public const MAX_PER_USER = 2000;
    /** A Host clock may run a little ahead; further than this is not a real event. */
    private const FUTURE_SECONDS = 300;

    public static function cardId(int $user, string $provider, string $id): string
    {
        return Uuid::uuid5(Uuid::NAMESPACE_URL, 'vibyra:cloud-host:'.$user.':'.$provider.':'.$id)->toString();
    }

    public static function stamp(Carbon $at): string
    {
        return $at->copy()->utc()->format('Y-m-d H:i:s.u');
    }

    /**
     * @param list<mixed> $events untrusted, one phase change each
     * @return array{accepted:int,duplicates:int,rejected:int,new:list<array>} `new` holds what was stored, for fan-out
     */
    public function ingest(object $w, array $events): array
    {
        return app(EventAuthority::class)->withCurrent($w, fn ($current) => $this->storeBatch($current, $events));
    }

    private function storeBatch(object $w, array $events): array
    {
        $out = ['accepted' => 0, 'duplicates' => 0, 'rejected' => 0, 'new' => []];
        foreach ($events as $raw) {
            $e = $this->normalize($raw);
            if ($e === null || !app(EventAuthority::class)->allowsProject($w, $e['project'])) { $out['rejected']++; continue; }
            $e['runtime_generation'] = (int) $w->generation;
            if ($this->store((int) $w->user_id, (string) $w->id, $e)) { $out['accepted']++; $out['new'][] = $e + ['user_id' => (int) $w->user_id, 'workspace_id' => $w->id]; }
            else $out['duplicates']++;
        }
        // A stop is bookkeeping, not work: it never keeps the computer awake (a Host boot may report many).
        $work = array_filter($out['new'], fn ($e) => $e['phase'] !== 'stopped');
        if ($work) $this->touch($w, max(array_map(fn ($e) => $e['at']->getTimestamp(), $work)));
        if ($out['new']) app(ActivityRetention::class)->cap((int) $w->user_id);
        return $out;
    }

    /** A `returned` row from the sync side: the PC picked a conversation up again. Never fails the caller. */
    public function returned(int $user, string $provider, string $id, string $project, ?string $title = null, ?Carbon $at = null): bool
    {
        $e = ['provider' => $provider, 'id' => $id, 'project' => $project, 'phase' => 'returned', 'title' => OwnerInput::clip($title), 'at' => $at ?? now()];
        if (!OwnerInput::provider($provider) || !OwnerInput::id($id) || !OwnerInput::project($project)) return false;
        return DB::transaction(function () use ($user, $project, $e) {
            app(Wallet::class)->lock($user);
            DB::table('users')->where('id', $user)->lockForUpdate()->first();
            $w = app(Computers::class)->find($user) ?? (object) ['id' => null, 'user_id' => $user];
            if (!app(ConnectConsent::class)->connected($user) || !app(EventAuthority::class)->allowsProject($w, $project)) return false;
            $stored = $this->store($user, null, $e);
            if ($stored) app(ActivityRetention::class)->cap($user);
            return $stored;
        }, 5);
    }

    private function normalize(mixed $raw): ?array
    {
        if (!is_array($raw)) return null;
        [$provider, $id, $project, $phase, $at] = [$raw['provider'] ?? null, $raw['id'] ?? null, $raw['project'] ?? null, $raw['phase'] ?? null, $raw['at'] ?? null];
        if (!is_string($provider) || !OwnerInput::provider($provider) || !is_string($id) || !OwnerInput::id($id)
            || !is_string($project) || !OwnerInput::project($project) || !in_array($phase, self::PHASES, true) || !is_string($at) || strlen($at) > 40) return null;
        try { $when = Carbon::parse($at); } catch (\Throwable) { return null; }
        if ($when->lt(now()->subDays(self::RETENTION_DAYS)) || $when->gt(now()->addSeconds(self::FUTURE_SECONDS))) return null;
        return ['provider' => $provider, 'id' => $id, 'project' => $project, 'phase' => $phase, 'title' => OwnerInput::clip($raw['title'] ?? null), 'at' => $when];
    }

    private function store(int $user, ?string $workspace, array $e): bool
    {
        return DB::table(self::TABLE)->insertOrIgnore(['user_id' => $user, 'workspace_id' => $workspace, 'provider' => $e['provider'],
            'runtime_generation' => $e['runtime_generation'] ?? null,
            'agent_session_id' => $e['id'], 'project' => $e['project'], 'phase' => $e['phase'], 'title' => $e['title'],
            'card_id' => self::cardId($user, $e['provider'], $e['id']), 'at' => self::stamp($e['at']), 'created_at' => now()]) === 1;
    }

    /** The last real work: a phase change keeps the computer up as a Host activity report does. Old replays cannot extend it. */
    private function touch(object $w, int $latest): void
    {
        $at = Carbon::createFromTimestamp(min($latest, now()->getTimestamp()));
        DB::table('cloud_workspaces')->where('id', $w->id)->where(fn ($q) => $q->whereNull('last_activity_at')->orWhere('last_activity_at', '<', $at))
            ->update(['last_activity_at' => $at]);
    }
}
