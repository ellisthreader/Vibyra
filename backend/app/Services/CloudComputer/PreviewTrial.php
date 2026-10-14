<?php
namespace App\Services\CloudComputer;

use App\Models\User;
use App\Services\Vibes\{DeviceCheck, Wallet};
use Illuminate\Support\Facades\DB;

/** Once per verified account and physical iPhone; normal Free AI grants cannot pay for runtime. */
final class PreviewTrial
{
    public function canClaim(int $user): bool
    {
        if (!config('cloud_preview.enabled') || !config('cloud_preview.trial_enabled')) return false;
        $account = User::find($user); $cohort = config('cloud_workspaces.pilot_users');
        return $account && !$account->isGuest() && $account->hasVerifiedEmail() && \App\Services\Membership\Units::modern($user)
            && config('cloud_workspaces.enabled') && (!$cohort || in_array((string) $user, $cohort, true))
            && !DB::table('cloud_preview_trials')->where('user_id', $user)->exists() && !$this->paidPro($user);
    }
    public function paidPro(int $user): bool
    {
        return app(Wallet::class)->planFor($user) === 'pro_v2' && DB::table('membership_periods')->where('user_id', $user)
            ->whereNull('revoked_at')->where('disputed', false)->where('provider', '!=', 'trial')
            ->where('starts_at', '<=', now())->where('ends_at', '>', now())->exists();
    }
    public function remaining(int $user): int
    {
        if (!config('cloud_preview.enabled') || !config('cloud_preview.trial_enabled')) return 0;
        $r = DB::table('cloud_preview_trials')->where('user_id', $user)->where('state', 'verified')->first();
        return $r ? max(0, (int) config('cloud_preview.trial_seconds') - (int) $r->used_seconds) : 0;
    }
    public function claim(int $user, string $token): array
    {
        abort_unless(config('cloud_preview.enabled') && config('cloud_preview.trial_enabled'), 503, 'Free Cloud Preview is awaiting release checks.');
        $account = User::findOrFail($user);
        abort_unless(!$account->isGuest() && $account->hasVerifiedEmail(), 403, 'Verify your account before trying Cloud Preview.');
        app(ComputeProfiles::class)->profile('standard');
        return DB::transaction(function () use ($user, $token) {
            app(Wallet::class)->lock($user);
            if (!DB::table('cloud_preview_trials')->where('user_id', $user)->exists()) {
                abort_unless($this->canClaim($user), 403, 'This account is not eligible for the cloud trial.');
                abort_unless(app(DeviceCheck::class)->claimCloudTrial($token), 403, 'This iPhone has already used its cloud trial, or could not be verified.');
                DB::table('cloud_preview_trials')->insert(['user_id' => $user, 'state' => 'verified', 'used_seconds' => 0,
                    'confirmed_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            }
            return ['remainingSeconds' => $this->remaining($user), 'totalSeconds' => (int) config('cloud_preview.trial_seconds')];
        }, 5);
    }
    public function consume(object $w, int $seconds): int
    {
        // Meter and this write commit together under the wallet lock; duplicate
        // settlement has no outstanding reservation and cannot spend seconds twice.
        $r = DB::table('cloud_preview_trials')->where('user_id', $w->user_id)->lockForUpdate()->firstOrFail();
        $covered = min($seconds, max(0, (int) config('cloud_preview.trial_seconds') - (int) $r->used_seconds));
        DB::table('cloud_preview_trials')->where('user_id', $w->user_id)->increment('used_seconds', $covered);
        return $covered;
    }
}
