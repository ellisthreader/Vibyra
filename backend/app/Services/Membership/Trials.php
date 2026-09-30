<?php

namespace App\Services\Membership;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The one Pro trial an account ever gets: a zero-price membership period, so
 * Entitlements treats the account as Pro until it ends and nothing else needs a
 * trial branch. It grants no tokens. Started when a modern wallet is created for
 * a verified account, or when that account verifies its email.
 */
final class Trials
{
    public const PROVIDER = 'trial';

    public function start(User $user): bool
    {
        $days = (int) config('membership.trial_days');
        if (!config('membership.enabled') || $days <= 0 || $user->isGuest() || !$user->hasVerifiedEmail()) return false;
        if (!Units::modern($user->id)) return false;
        // Anyone who has ever had a membership period, trial or paid, has had theirs.
        if (DB::table('membership_periods')->where('user_id', $user->id)->exists()) return false;
        return DB::table('membership_periods')->insertOrIgnore([
            'reference' => self::PROVIDER.':'.$user->id, 'user_id' => $user->id, 'provider' => self::PROVIDER,
            'environment' => 'none', 'offer_key' => 'pro_trial', 'starts_at' => now(), 'ends_at' => now()->addDays($days),
            'units' => 0, 'paid_minor' => 0, 'currency' => 'GBP', 'created_at' => now(), 'updated_at' => now(),
        ]) > 0;
    }
}
