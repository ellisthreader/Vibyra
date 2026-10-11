<?php
namespace App\Services\AgentBrowser;

use App\Models\AgentV2\{BrowserHandoff, RuntimeBinding, ToolAction};
use App\Models\VibyraSession;
use App\Services\AgentRuns\{ApiError, Leases};
use App\Services\AgentRuns\Browser\{BrowserActions, BrowserRuntimeScope};
use App\Services\AgentRuns\Jobs\AccountLock;

/** Every private read and input rechecks the same owner, session, run, action and lease. */
final class PrivateAuthority
{
    public static function action(RuntimeBinding $b, string $run, string $action, int $generation): ToolAction
    {
        AccountLock::force($b->user_id);
        abort_unless(BrowserRuntimeScope::enabled($b), 409, 'Cloud browser is unavailable.');
        $r = app(Leases::class)->fenced($b, $run, $generation);
        $a = ToolAction::whereKey($action)->where('run_id', $r->id)->where('user_id', $b->user_id)->lockForUpdate()->first();
        abort_unless($r->lease_expires_at?->isFuture() && $a && $a->tool === 'browser_takeover_request'
            && $a->state === 'dispatching' && (int) $a->claimed_generation === $generation && !BrowserActions::stale($a, $r),
            409, 'This private browser session is no longer active.');
        return $a;
    }

    public static function owner(VibyraSession $session, string $id, bool $view = true): BrowserHandoff
    {
        AccountLock::force($session->user_id);
        $h = BrowserHandoff::whereKey($id)->where('user_id', $session->user_id)->lockForUpdate()->first();
        abort_unless($h, 404);
        self::current($h);
        if ($view && $h->viewer_session_id !== (string) $session->id)
            ApiError::throw(409, 'browser_viewer_changed', 'Open this private browser on the device that took control.');
        return $h;
    }

    public static function helper(RuntimeBinding $b, string $id, int $generation): BrowserHandoff
    {
        AccountLock::force($b->user_id);
        $h = BrowserHandoff::whereKey($id)->where('runtime_id', $b->id)->where('user_id', $b->user_id)->lockForUpdate()->first();
        abort_unless($h && $h->generation === $generation, 409, 'Private browser lease changed.');
        self::current($h);
        return $h;
    }

    public static function current(BrowserHandoff $h): void
    {
        abort_unless($h->expires_at->isFuture() && in_array($h->state, ['waiting', 'active', 'resuming'], true), 409,
            'This private browser session ended.');
        $b = RuntimeBinding::whereKey($h->runtime_id)->whereNull('revoked_at')->first();
        abort_unless($b, 409, 'Cloud browser was removed.');
        self::action($b, $h->run_id, $h->action_id, $h->generation);
        if ($h->viewer_session_id !== null) {
            $s = VibyraSession::whereKey($h->viewer_session_id)->where('user_id', $h->user_id)->first();
            abort_unless($s && !$s->revoked_at && $s->absolute_expires_at?->isFuture() && $s->idle_expires_at?->isFuture(),
                409, 'The device that took private control signed out.');
        }
    }

    public static function payload(BrowserHandoff $h): array
    {
        return ['id' => $h->id, 'runId' => $h->run_id, 'actionId' => $h->action_id, 'runtimeId' => $h->runtime_id,
            'origin' => $h->origin, 'state' => $h->state, 'revision' => $h->revision, 'frameSequence' => $h->frame_sequence,
            'commandSequence' => $h->command_sequence, 'acknowledgedSequence' => $h->acknowledged_sequence,
            'expiresAt' => $h->expires_at->toIso8601String()];
    }
}
