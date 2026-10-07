<?php
namespace App\Services\CloudComputer;

use App\Models\VibyraSession;
use App\Services\CloudWorkspaces\{Budgets, Eligibility, FlyProvider, Quotes, Reservations, Shutdown, Workspaces};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Cache, Crypt, DB, Log};
use Illuminate\Support\Str;

/**
 * Wake and stop for the cloud computer. Reuses the hosted-workspace lifecycle
 * (Lifecycle::reconcile boots it, Runtime bootstraps it, Shutdown stops it) and
 * every Start safety check, minus the per-start quote, device proof and budget
 * screens: Pro membership, first-wake terms and the included-hours Allowance
 * (then the token wallet) cover consent. Runway holds still go through Reservations.
 * forSync is the same start with no phone session: the server wakes the computer itself so what the Mac sent gets applied.
 */
class Wake
{
    /** forSync tries at most once per this many seconds per account (a failed try waits for the next). */
    public const SYNC_WAKE_SECONDS = 120;
    /** Starts for the same oldest unapplied upload, at most, before it is left for a person to look at (no endless wake loop). */
    public const SYNC_WAKE_TRIES = 3;

    public function wake(VibyraSession $session, array $o): object
    {
        return $this->start($session->user_id, $session->id, $o);
    }

    /**
     * Wakes the computer to apply synced work: an upload or login landed, the person asked for a repair, or a Mac with ticked
     * projects is waiting for the computer's first key. Every check of wake() still applies (agreement, eligibility, terms
     * already covered, start caps, capacity, allowance); a refusal is logged, never thrown. Running or starting: nothing to do.
     * A computer that just failed to boot is left alone for 30 minutes rather than retried every two, unless the person asked.
     */
    public function forSync(int $user, bool $asked = false): void
    {
        $w = app(Computers::class)->find($user);
        if (!$w || in_array($w->state, ['starting', 'ready'], true)) return;
        // A person's own "Sync again" is never held back by an automatic retry pause.
        if (!$asked && in_array($w->stop_reason, Computers::START_FAILED, true) && now()->lt(\Illuminate\Support\Carbon::parse($w->updated_at)->addMinutes(30))) return;
        $oldest = DB::table('cloud_sync_blobs')->where('user_id', $user)->where('direction', 'up')->whereNull('applied_at')->whereNull('failed_at')->orderBy('created_at')->value('id');
        $tries = 'cloud-sync-wake-tries:'.$user.':'.($oldest ?? 'key');
        if (!$asked && (int) Cache::get($tries, 0) >= self::SYNC_WAKE_TRIES) return;
        // A repair the person asked for goes now; automatic tries wait out the last one.
        if ($asked) Cache::put('cloud-sync-wake:'.$user, 1, self::SYNC_WAKE_SECONDS);
        elseif (!Cache::add('cloud-sync-wake:'.$user, 1, self::SYNC_WAKE_SECONDS)) return;
        try { $this->start($user, null, []); Cache::put($tries, (int) Cache::get($tries, 0) + 1, now()->addDay()); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { Log::info('cloud sync wake refused', ['user' => $user, 'code' => $e->getResponse()->getData(true)['code'] ?? null]); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { Log::info('cloud sync wake refused', ['user' => $user, 'status' => $e->getStatusCode(), 'message' => $e->getMessage()]); }
    }

    /** After the response: the Mac's upload or check-in never waits on the start. */
    public function forSyncLater(int $user, bool $asked = false): void
    {
        app()->terminating(fn () => app(self::class)->forSync($user, $asked));
    }

    /**
     * The person just connected or ticked projects: a sleeping computer with synced work (first of all, no key yet) starts
     * after the response, past the automatic retry pause; every check of wake() still applies.
     */
    public function forPerson(int $user): void
    {
        if ($this->syncWaiting($user)) $this->forSyncLater($user, true);
    }

    /** An upload (code, conversations or a login) landed: a running computer stays up for it, a sleeping one is started. */
    public function afterUpload(int $user): void
    {
        app(SyncKeys::class)->touchComputer($user);
        if ($this->syncWaiting($user)) $this->forSyncLater($user);
    }

    /** Synced work waiting on a sleeping computer: uploads to apply, or ticked projects and no computer key yet (first start). */
    public function syncWaiting(int $user): bool
    {
        $w = app(Computers::class)->find($user);
        if (!$w || !in_array($w->state, ['stopped', 'archived', 'expired'], true) || !app(ConnectConsent::class)->connected($user)) return false;
        return app(SyncQueue::class)->pendingCount($user) > 0
            || (app(SyncKeys::class)->vmKey($user) === null && app(AccessProjects::class)->allowedKeys($user) !== []);
    }

    private function start(int $user, ?int $sessionId, array $o): object
    {
        app(FlyProvider::class)->preflight();
        $id = DB::transaction(function () use ($sessionId, $o, $user) {
            app(Wallet::class)->lock($user);
            $w = DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'computer')->where('state', '!=', 'deleted')->lockForUpdate()->first();
            if (!$w) Computers::fail('computer_missing', 'Create your cloud computer first.', 404);
            // A computer made before the phone agreement, or after the agreement was withdrawn or outdated, stays asleep.
            if (!app(ConnectConsent::class)->connected($user)) Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
            if ($w->state === 'starting') return $w->id;
            if ($w->state === 'ready') Computers::fail('already_running', 'Your cloud computer is already running.', 409);
            if (!in_array($w->state, ['stopped', 'archived', 'expired'], true)) Computers::fail('not_stopped', 'Your cloud computer is still stopping. Try again shortly.', 409);
            app(Eligibility::class)->authorize($user, true);
            if (!$w->terms_accepted_at && empty($o['acceptTerms']) && !app(EnsureComputer::class)->termsCovered($user)) {
                Computers::fail('terms_required', 'Accept the cloud computer storage and retention terms to wake it for the first time.', 422);
            }
            DB::table('cloud_workspace_control')->where('id', 1)->lockForUpdate()->firstOrFail();
            $accepted = fn (string $since, ?int $only = null) => DB::table('cloud_computer_wakes')->when($only, fn ($q) => $q->where('user_id', $only))->where('created_at', '>=', $since)->count()
                + DB::table('cloud_quotes')->when($only, fn ($q) => $q->where('user_id', $only))->where('accepted_at', '>=', $since)->count();
            abort_if($accepted(now()->subHour()->toDateTimeString(), $user) >= config('cloud_workspaces.starts_per_account_hour')
                || $accepted(now()->subDay()->toDateTimeString(), $user) >= config('cloud_workspaces.starts_per_account_day'), 429, 'Too many cloud starts. Try again later.');
            abort_if($accepted(now()->subDay()->toDateTimeString()) >= config('cloud_workspaces.starts_per_global_day'), 503, 'Hosted startup capacity is reached for today.');
            abort_if(DB::table('cloud_workspaces')->where('user_id', $user)->whereIn('state', Workspaces::ACTIVE)->exists(), 409, 'Stop your other cloud computer first.');
            abort_if(DB::table('cloud_workspaces')->whereIn('state', Workspaces::ACTIVE)->count() >= config('cloud_workspaces.global_running_limit'), 503, 'Cloud computers are at capacity.');
            $max = (int) config('cloud_workspaces.max_background_seconds');
            $seconds = max(60, min($max, (int) ($o['deadlineSeconds'] ?? $max)));
            $budget = app(Budgets::class)->committed($w) + min((int) config('cloud_workspaces.max_budget_units'), (int) config('cloud_workspaces.account_daily_units'));
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'starting', 'operation_id' => (string) Str::uuid(),
                'generation' => $w->generation + 1, 'revision' => $w->revision + 1, 'app_session_id' => $sessionId, 'device_id' => null, 'device_generation' => null,
                'region' => $w->region ?: config('cloud_workspaces.region'), 'tariff_version' => config('cloud_workspaces.tariff_version'),
                'units_per_hour' => config('cloud_workspaces.units_per_hour'), 'provider_micro_per_hour' => config('cloud_workspaces.provider_micro_per_hour'),
                'budget_units' => $budget, 'ready_at' => null, 'metered_at' => null, 'lease_until' => null, 'heartbeat_at' => null,
                'bootstrap_secret' => Crypt::encryptString(Str::random(64)), 'bootstrapped_at' => null, 'runtime_token_hash' => null,
                'stop_requested_at' => null, 'stop_reason' => null, 'retention_warned_at' => null, 'retention_deleted_at' => null, 'unsaved_possible' => false, 'deadline_at' => now()->addSeconds($seconds),
                'last_activity_at' => now(), 'host_running' => 0, 'host_waiting' => 0, 'host_activity_at' => null,
                'terms_accepted_at' => $w->terms_accepted_at ?? now(), 'updated_at' => now()]);
            $fresh = DB::table('cloud_workspaces')->where('id', $w->id)->first();
            try { app(Reservations::class)->reserve($fresh, Quotes::runway((int) $fresh->units_per_hour)); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                if ($e->getStatusCode() === 402) Computers::fail('allowance_exhausted', 'Your included cloud hours are used up and you need more tokens to keep going.', 402);
                throw $e;
            }
            DB::table('cloud_computer_wakes')->insert(['workspace_id' => $w->id, 'user_id' => $user, 'created_at' => now()]);
            \App\Jobs\ReconcileCloudWorkspace::dispatch($w->id)->afterCommit();
            return $w->id;
        }, 5);
        return DB::table('cloud_workspaces')->where('id', $id)->first();
    }

    public function stop(int $user): ?object
    {
        $w = app(Computers::class)->find($user);
        if (!$w) Computers::fail('computer_missing', 'Create your cloud computer first.', 404);
        $w = app(Shutdown::class)->request($user, $w->id, 'user_stop');
        \App\Jobs\ReconcileCloudWorkspace::dispatch($w->id);
        return DB::table('cloud_workspaces')->where('id', $w->id)->first();
    }
}
