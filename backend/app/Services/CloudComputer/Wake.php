<?php
namespace App\Services\CloudComputer;

use App\Models\VibyraSession;
use App\Services\CloudWorkspaces\{Budgets, Eligibility, FlyProvider, Quotes, Reservations, Shutdown, Workspaces};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

/**
 * Wake and stop for the cloud computer. Reuses the hosted-workspace lifecycle
 * (Lifecycle::reconcile boots it, Runtime bootstraps it, Shutdown stops it) and
 * every Start safety check, minus the per-start quote, device proof and budget
 * screens: Pro membership, first-wake terms and the included-hours Allowance
 * (then the token wallet) cover consent. Runway holds still go through Reservations.
 */
class Wake
{
    public function wake(VibyraSession $session, array $o): object
    {
        app(FlyProvider::class)->preflight();
        $user = $session->user_id;
        $id = DB::transaction(function () use ($session, $o, $user) {
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
                'generation' => $w->generation + 1, 'revision' => $w->revision + 1, 'app_session_id' => $session->id, 'device_id' => null, 'device_generation' => null,
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
