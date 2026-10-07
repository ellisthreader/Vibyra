<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\{Eligibility, SpendGuard};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

/** The account's one cloud computer: a cloud_workspaces row with kind = 'computer'. */
class Computers
{
    /** Host reports older than this no longer count as live activity. */
    public const FRESH_SECONDS = 60;
    /** Stop reasons of a start that failed: the computer shows as `error` with a sentence, and sync does not retry it at once. */
    public const START_FAILED = ['boot_timeout', 'boot_failed', 'host_unreachable', 'provider_review'];

    public static function fail(string $code, string $message, int $status, array $extra = []): never
    {
        throw new HttpResponseException(response()->json(['ok' => false, 'code' => $code, 'message' => $message, 'error' => $message] + $extra, $status));
    }

    public function find(int $user): ?object
    {
        return DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'computer')->where('state', '!=', 'deleted')->first();
    }

    public function forHost(int $remoteHostId): ?object
    {
        return DB::table('cloud_workspaces')->where('kind', 'computer')->where('remote_host_id', $remoteHostId)->where('state', '!=', 'deleted')->first();
    }

    /** Idempotent: one computer per account. A second id returns the existing computer. */
    public function create(int $user, string $id, ?string $name): object
    {
        try {
            return DB::transaction(function () use ($user, $id, $name) {
                app(Wallet::class)->lock($user);
                app(Eligibility::class)->authorize($user);
                if ($existing = $this->find($user)) return $existing;
                abort_if(DB::table('cloud_workspaces')->where('id', $id)->exists(), 409, 'This creation ID was already used.');
                // A deleted computer must not keep the account's uniqueness slot.
                DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'computer')->where('state', 'deleted')->update(['computer_user_id' => null]);
                app(SpendGuard::class)->admitCreate();
                DB::table('cloud_workspaces')->insert(['id' => $id, 'user_id' => $user, 'name' => $name ?: 'Cloud computer', 'project_id' => 'cloud-computer',
                    'kind' => 'computer', 'computer_user_id' => $user, 'source' => 'computer', 'state' => 'stopped', 'region' => config('cloud_workspaces.region'),
                    'app_name' => 'vibyra-ws-'.str_replace('-', '', $id), 'created_at' => now(), 'updated_at' => now()]);
                return DB::table('cloud_workspaces')->where('id', $id)->first();
            }, 3);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // A concurrent create for the same account won the unique slot.
            if ($existing = $this->find($user)) return $existing;
            throw new \RuntimeException('Cloud computer creation conflicted.');
        }
    }

    public function online(object $w): bool
    {
        if (!$w->remote_host_id) return false;
        $host = DB::table('remote_hosts')->where('id', $w->remote_host_id)->first();
        return $host && !$host->revoked_at && $host->online_until && now()->lt($host->online_until);
    }

    /** none|stopped|starting|running|idle|stopping|error */
    public function stateOf(object $w, ?bool $online = null): string
    {
        $online ??= $this->online($w);
        return match ($w->state) {
            'starting' => 'starting',
            'ready' => !$online ? 'starting' : ($this->active($w) > 0 ? 'running' : 'idle'),
            'stopping' => 'stopping',
            'recovery_required' => 'error',
            'stopped', 'archived', 'expired' => in_array($w->stop_reason, self::START_FAILED, true) ? 'error' : 'stopped',
            default => 'none',
        };
    }

    public function isFresh(object $w): bool
    {
        return $w->host_activity_at && now()->lt(\Illuminate\Support\Carbon::parse($w->host_activity_at)->addSeconds(self::FRESH_SECONDS));
    }

    public function active(object $w): int
    {
        return $this->isFresh($w) ? (int) $w->host_running + (int) $w->host_waiting : 0;
    }

    public function hostFields(object $w, bool $online): array
    {
        return ['kind' => 'cloud', 'workspaceId' => $w->id, 'cloudState' => $this->stateOf($w, $online)];
    }

    /** The state object S. */
    public function payload(int $user): array
    {
        $enabled = true;
        try { app(Eligibility::class)->authorize($user); } catch (\Symfony\Component\HttpKernel\Exception\HttpException) { $enabled = false; }
        $w = $this->find($user); $consent = app(ConnectConsent::class);
        $link = ['connected' => $consent->connected($user), 'consentVersion' => $consent->current(), 'capacity' => app(AccessCapacity::class)->payload($user)];
        if (!$w) return ['enabled' => $enabled] + $link + ['computer' => null];
        $host = $w->remote_host_id ? DB::table('remote_hosts')->where('id', $w->remote_host_id)->first() : null;
        $online = $host && !$host->revoked_at && $host->online_until && now()->lt($host->online_until);
        $state = $this->stateOf($w, (bool) $online);
        $up = in_array($state, ['running', 'idle'], true);
        $fresh = $this->isFresh($w);
        $flag = fn ($v) => $up && $v !== null ? (bool) $v : null;
        return ['enabled' => $enabled] + $link + ['computer' => [
            'workspaceId' => $w->id, 'hostId' => $host && !$host->revoked_at ? $host->host_id : null, 'state' => $state, 'online' => (bool) $online,
            'lastActiveAt' => $w->last_activity_at ? \Illuminate\Support\Carbon::parse($w->last_activity_at)->toIso8601String() : null,
            'error' => $state === 'error' ? $this->error($w) : null,
            'sessionsActive' => $fresh ? (int) $w->host_running : 0, 'approvalsWaiting' => $fresh ? (int) $w->host_waiting : 0,
            'login' => ['claude' => $flag($w->login_claude), 'codex' => $flag($w->login_codex)],
            'hours' => app(Hours::class)->summary($user),
            'projects' => app(SyncState::class)->merge($user, app(Projects::class)->listFor($w)),
            'sync' => app(SyncState::class)->summary($user),
            // removedAt: a long-stopped computer's volume was removed to save space; "set up again" is a normal wake.
            // removeAt: when a stopped computer's volume will be removed.
            'removedAt' => $w->retention_deleted_at ? \Illuminate\Support\Carbon::parse($w->retention_deleted_at)->toIso8601String() : null,
            'removeAt' => $state === 'stopped' && !$w->retention_deleted_at && ($w->machine_id || $w->volume_id || $w->generation > 0)
                ? \Illuminate\Support\Carbon::parse($w->updated_at)->addDays(max(7, (int) config('cloud_workspaces.computer_stopped_days')))->toIso8601String() : null]];
    }

    private function error(object $w): string
    {
        return match ($w->stop_reason) {
            'boot_timeout' => 'Your cloud computer did not start in time. Try waking it again.',
            'boot_failed' => 'Your cloud computer could not start. Try waking it again.',
            'host_unreachable' => 'Your cloud computer started but could not connect to Vibyra Cloud. Try waking it again.',
            'provider_review' => 'Vibyra Cloud couldn’t start: its storage needs a check by Vibyra. Your projects are safe on your Mac.',
            default => 'Your cloud computer needs attention. Stop it and wake it again.',
        };
    }
}
