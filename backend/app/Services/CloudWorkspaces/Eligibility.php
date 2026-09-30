<?php
namespace App\Services\CloudWorkspaces;

use App\Models\User;
use App\Services\Membership\Units;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

final class Eligibility
{
    public function authorize(int $user, bool $start = false): void
    {
        $account = User::findOrFail($user);
        abort_if($account->isGuest() || !$account->hasVerifiedEmail(), 403, 'Verify your account before using a cloud computer.');
        abort_unless(config('cloud_workspaces.enabled'), 503, 'Hosted computers are not available yet.');
        $cohort = config('cloud_workspaces.pilot_users');
        abort_if($cohort && !in_array((string) $user, $cohort, true), 403, 'Hosted computers are currently in a limited pilot.');
        abort_unless(Units::modern($user), 409, 'This account needs the versioned token wallet before hosted computing.');
        abort_unless(app(Wallet::class)->planFor($user) === 'pro_v2', 402, 'An active Pro membership is needed for a cloud computer.');
        abort_if(DB::table('membership_periods')->where('user_id', $user)->where('disputed', true)->exists(), 402, 'Resolve your payment dispute before continuing.');
        abort_if(DB::table('membership_periods')->where('user_id', $user)->whereColumn('refund_requested', '>', 'refunded_minor')->exists()
            || DB::table('membership_orders')->where('user_id', $user)->where('refund_pending', true)->exists(), 503, 'A refund is waiting for usage reconciliation.');
        if ($start) {
            if (config('cloud_workspaces.provider_audit_required')) {
                $audit = DB::table('cloud_workspace_control')->where('id', 1)->first();
                abort_unless($audit && !$audit->admission_blocked && $audit->provider_audited_at
                    && now()->lt(\Illuminate\Support\Carbon::parse($audit->provider_audited_at)->addMinutes(2)), 503, 'Cloud resources need a successful provider audit before starting.');
            }
            abort_unless(config('cloud_workspaces.starts_enabled'), 503, 'Starting hosted computers is temporarily unavailable.');
            abort_unless(config('cloud_workspaces.units_per_hour') > 0 && config('cloud_workspaces.provider_micro_per_hour') > 0
                && config('cloud_workspaces.tariff_version') && config('cloud_workspaces.daily_micro_limit') > 0, 503, 'Hosted pricing has not been configured.');
            abort_unless(config('cloud_workspaces.units_per_hour') >= config('cloud_workspaces.provider_micro_per_hour'), 503, 'Hosted pricing needs review.');
        }
    }
}
