<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\SpendGuard;
use Illuminate\Support\Facades\DB;

/** Conservative operator exposure, including retained disks and unbilled startup. */
final class PreviewCosts
{
    public function guard(object $w, int $nextMicro): void
    {
        if (!($w->compute_profile ?? null)) return;
        // Called after the shared spend-day lock. Every concurrent cloud hold is
        // serialized before reading aggregate exposure.
        $retained = DB::table('cloud_workspaces')->where('state', '!=', 'deleted')->where(fn ($q) => $q->whereNotNull('volume_id')->orWhereIn('state', ['starting','ready','stopping','recovery_required']))->count();
        if (!$w->volume_id && !in_array($w->state, ['starting','ready','stopping','recovery_required'], true)) $retained++;
        $fixed = $retained * (int) config('cloud_preview.economics.fixed_micro_month');
        $network = $this->networkHeld();
        $extra = fn ($since) => (int) DB::table('cloud_provider_exposures')->where('created_at', '>=', $since)->sum('micro_usd');
        abort_if(app(SpendGuard::class)->today() + $extra(now()->startOfDay()) + $network + intdiv($fixed + 29, 30) + $nextMicro > config('cloud_preview.daily_micro_limit'), 503, 'Cloud has reached today’s all-in cost limit.');
        abort_if(app(SpendGuard::class)->month() + $extra(now()->startOfMonth()) + $network + $fixed + $nextMicro > config('cloud_preview.monthly_micro_limit'), 503, 'Cloud has reached its monthly all-in cost limit.');
        if ($w->compute_trial ?? false) {
            abort_if(DB::table('cloud_workspaces')->where('compute_trial', true)->whereIn('state', ['starting','ready','stopping','recovery_required'])->count() > config('cloud_preview.free_running_limit'), 503, 'Free cloud machines are at capacity.');
            $rows = DB::table('cloud_reservations as r')->where('r.preview_trial', true);
            foreach ([['day', now()->startOfDay()], ['month', now()->startOfMonth()]] as [$period, $since]) {
                $used = (int) (clone $rows)->where('r.created_at', '>=', $since)->selectRaw('COALESCE(SUM(CASE WHEN r.settled_at IS NULL THEN r.spend_held ELSE r.actual_micro_usd END), 0) AS cost')->value('cost');
                $trialRetained = DB::table('cloud_workspaces')->where('compute_trial', true)->where('state', '!=', 'deleted')->where(fn ($q) => $q->whereNotNull('volume_id')->orWhereIn('state',['starting','ready','stopping','recovery_required']))->count();
                $storage = ($trialRetained + (!$w->volume_id && !in_array($w->state, ['starting','ready','stopping','recovery_required'], true) ? 1 : 0)) * (int) config('cloud_preview.economics.fixed_micro_month');
                $overhead = (int) DB::table('cloud_provider_exposures')->where('trial', true)->where('created_at', '>=', $since)->sum('micro_usd');
                abort_if($used + $overhead + $this->networkHeld(true) + ($period === 'day' ? intdiv($storage + 29,30) : $storage) + $nextMicro > config('cloud_preview.trial_'.$period.'_micro_limit'), 503, 'Free Cloud Preview is at capacity.');
            }
        }
    }
    private function networkHeld(bool $trial = false): int
    {
        $bytes = (int) DB::table('cloud_egress_counters as n')->join('cloud_workspaces as w', 'w.id', '=', 'n.workspace_id')
            ->when($trial, fn ($q) => $q->where('w.compute_trial', true))
            ->selectRaw('COALESCE(SUM(n.authorized_bytes - n.bytes),0) AS held')->value('held');
        return intdiv($bytes * (int) config('cloud_preview.egress_micro_per_gib') + 1073741823, 1073741824);
    }
    public function startup(object $w): void
    {
        if (!($w->compute_profile ?? null)) return;
        $cost = (int) config('cloud_preview.startup_exposure_micro');
        abort_unless($cost > 0, 503, 'Cloud startup costs need verification.');
        $this->guard($w, $cost);
        DB::table('cloud_provider_exposures')->insertOrIgnore(['idempotency_key' => 'startup:'.$w->id.':'.$w->generation,
            'workspace_id' => $w->id, 'generation' => $w->generation, 'trial' => $w->compute_trial ?? false,
            'kind' => 'startup_failure_estimate', 'micro_usd' => $cost, 'created_at' => now(), 'updated_at' => now()]);
    }
}
