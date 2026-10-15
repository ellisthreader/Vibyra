<?php
namespace App\Services\CloudComputer\Activity;

use App\Services\CloudComputer\{Computers, ConnectConsent, Owners\ConversationOwners};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * GET /api/cloud-computer/activity (docs/cloud-switching-contract.md section 2): what happened while the person was
 * away, and what is working now. `running` and `approvals` come from the LATEST phase of each conversation.
 */
class ActivityFeed
{
    public const EVENT_LIMIT = 200;
    public const DEFAULT_WINDOW_HOURS = 24;
    /**
     * `running` and `approvals` are bounded twice so a Host that died mid-turn cannot show work for hours: the Host's own
     * report must be inside Computers::FRESH_SECONDS (60 s; it reports every 15 s), and a running/waiting phase must be
     * newer than this with no later event (a Host re-posts `running` with a fresh `at` to keep a long turn listed).
     */
    public const PHASE_MAX_AGE_SECONDS = 900;

    public function payload(int $user, ?Carbon $since = null): array
    {
        $since ??= now()->subHours(self::DEFAULT_WINDOW_HOURS);
        [$running, $approvals] = $this->live($user);
        return ['events' => $this->events($user, $since), 'running' => $running, 'approvals' => $approvals, 'updatedAt' => self::iso(now())];
    }

    /** Attention events newer than `since`, oldest first (the newest EVENT_LIMIT when there are more). */
    private function events(int $user, Carbon $since): array
    {
        $rows = DB::table(HostEvents::TABLE)->where('user_id', $user)->whereIn('phase', array_keys(HostEvents::KINDS))
            ->where('at', '>', HostEvents::stamp($since))->orderByDesc('at')->orderByDesc('id')->limit(self::EVENT_LIMIT)->get()->reverse();
        return $rows->map(fn ($r) => ['provider' => $r->provider, 'id' => $r->agent_session_id, 'project' => $r->project, 'phase' => $r->phase,
            'kind' => HostEvents::KINDS[$r->phase], 'title' => $r->title, 'at' => self::iso($r->at)])->values()->all();
    }

    /** @return array{0:list<array>,1:int} conversations whose latest phase is running or waiting, and how many wait */
    private function live(int $user): array
    {
        $floor = $this->liveFloor($user);
        if ($floor === null) return [[], 0];
        $workspace = app(Computers::class)->find($user);
        if (!$workspace || !app(ConnectConsent::class)->connected($user)) return [[], 0];
        $rows = DB::table(HostEvents::TABLE.' as e')->where('e.user_id', $user)->whereIn('e.phase', ['running', 'waiting'])->where('e.at', '>=', HostEvents::stamp($floor))
            ->where('e.workspace_id', $workspace->id)->where('e.runtime_generation', $workspace->generation)
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from(HostEvents::TABLE.' as n')
                ->whereColumn('n.user_id', 'e.user_id')->whereColumn('n.provider', 'e.provider')->whereColumn('n.agent_session_id', 'e.agent_session_id')
                ->whereIn('n.phase', HostEvents::PHASES)
                ->where(fn ($w) => $w->whereColumn('n.at', '>', 'e.at')->orWhere(fn ($t) => $t->whereColumn('n.at', 'e.at')->whereColumn('n.id', '>', 'e.id'))))
            ->orderBy('e.at')->orderBy('e.id')->limit(HostEvents::MAX_PER_USER)->get(['e.provider', 'e.agent_session_id', 'e.project', 'e.phase', 'e.title']);
        $allowed = []; $authority = app(EventAuthority::class);
        $rows = $rows->filter(function ($e) use ($workspace, $authority, &$allowed) {
            return $allowed[$e->project] ??= $authority->allowsProject($workspace, $e->project);
        })->take(50);
        $titles = DB::table(ConversationOwners::TABLE)->where('user_id', $user)->whereIn('agent_session_id', $rows->pluck('agent_session_id')->all())
            ->get(['provider', 'agent_session_id', 'title'])->mapWithKeys(fn ($r) => [$r->provider.'|'.$r->agent_session_id => $r->title]);
        $list = $rows->map(fn ($r) => ['provider' => $r->provider, 'id' => $r->agent_session_id, 'project' => $r->project,
            'title' => $r->title ?? ($titles[$r->provider.'|'.$r->agent_session_id] ?? null), 'phase' => $r->phase,
            // The Live Activity card id: a phone that starts the card itself registers its token under it.
            'cardId' => HostEvents::cardId($user, $r->provider, $r->agent_session_id)])->values()->all();
        return [$list, count(array_filter($list, fn ($r) => $r['phase'] === 'waiting'))];
    }

    /**
     * The earliest `at` that can still be live, or null when nothing can be: the computer must be up, the Host
     * reporting inside the freshness window, and an event must belong to this boot and be at most PHASE_MAX_AGE_SECONDS
     * old (a conversation cut off by a sleep or a crash never reports `finished`; a new Host reports `stopped`).
     */
    private function liveFloor(int $user): ?Carbon
    {
        $w = app(Computers::class)->find($user);
        if (!$w || $w->state !== 'ready' || !app(Computers::class)->isFresh($w)) return null;
        $floor = now()->subSeconds(min((int) config('cloud_workspaces.max_background_seconds'), self::PHASE_MAX_AGE_SECONDS));
        // A little before ready: the Host may report its first resumed turn a moment ahead of the heartbeat that marks ready.
        $ready = $w->ready_at ? Carbon::parse($w->ready_at)->subSeconds(20) : null;
        return $ready && $ready->gt($floor) ? $ready : $floor;
    }

    /** The latest phase of one conversation, or null when it has none. */
    public function latestPhase(int $user, string $provider, string $id): ?string
    {
        return DB::table(HostEvents::TABLE)->where('user_id', $user)->where('provider', $provider)->where('agent_session_id', $id)
            ->whereIn('phase', HostEvents::PHASES)->orderByDesc('at')->orderByDesc('id')->value('phase');
    }

    /** Microseconds kept: a client echoes `at` back as `since` and must not see the same event twice. */
    public static function iso(mixed $at): string
    {
        return Carbon::parse($at, 'UTC')->utc()->format('Y-m-d\\TH:i:s.u\\Z');
    }
}
