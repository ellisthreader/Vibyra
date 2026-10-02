<?php

namespace App\Services\Membership\Licenses;

use App\Services\Membership\Units;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class Allowance
{
    /** Caller holds the wallet lock. Never backfill missed monthly allowances. */
    public function refresh(int $user): void
    {
        foreach (DB::table('membership_licenses')->where('user_id', $user)->whereNotNull('redeemed_at')
            ->whereNull('revoked_at')->where('ends_at', '>', now())->get() as $license) {
            $anchor = Carbon::parse($license->redeemed_at);
            $end = Carbon::parse($license->ends_at);
            $months = 0;
            if ($license->allowance === 'monthly') {
                $months = max(0, (now()->year - $anchor->year) * 12 + now()->month - $anchor->month);
                if ($anchor->copy()->addMonthsNoOverflow($months)->isFuture()) $months--;
                $end = $end->min($anchor->copy()->addMonthsNoOverflow($months + 1));
            }
            $reference = 'license:'.$license->id.':'.$months;
            if (DB::table('vibes_grants')->where('reference', $reference)->exists()) continue;
            app(Wallet::class)->grant($user, $reference, 'license', $license->tokens * Units::SCALE);
            DB::table('vibes_grants')->where('reference', $reference)->update(['expires_at' => $end]);
            Issuance::audit($license->id, $user, 'allowance_granted');
        }
    }

    /** Already reserved work may settle; its unused reservation must not return. */
    public function remove(object $license): void
    {
        foreach (DB::table('vibes_grants')->where('user_id', $license->user_id)
            ->where('reference', 'like', 'license:'.$license->id.':%')->whereNull('revoked_at')->get() as $grant) {
            DB::table('vibes_grants')->where('id', $grant->id)->update(['remaining' => 0, 'revoked_at' => now()]);
            app(Wallet::class)->record($license->user_id, 'license-revoke:'.$grant->id, 'revocation', -(int) $grant->remaining);
        }
    }

    public function summary(int $user): ?array
    {
        $l = DB::table('membership_licenses')->where('user_id', $user)->whereNull('revoked_at')
            ->whereNotNull('redeemed_at')->where('ends_at', '>', now())->first();
        if (!$l) return null;
        $next = null;
        if ($l->allowance === 'monthly') {
            $anchor = Carbon::parse($l->redeemed_at);
            $months = max(0, (now()->year - $anchor->year) * 12 + now()->month - $anchor->month);
            if ($anchor->copy()->addMonthsNoOverflow($months)->isFuture()) $months--;
            $date = $anchor->copy()->addMonthsNoOverflow($months + 1);
            if ($date->lt(Carbon::parse($l->ends_at))) $next = $date->toIso8601String();
        }
        return ['endsAt' => Carbon::parse($l->ends_at)->toIso8601String(), 'tokens' => $l->tokens,
            'allowance' => $l->allowance, 'nextAt' => $next,
            'betaWelcome' => $l->beta_welcome && !$l->beta_welcome_seen_at
                && \App\Models\User::whereKey($user)->whereNotNull('email_verified_at')->whereNull('guest_at')->exists()
                ? ['id' => $l->id, 'months' => $l->duration_months ? (int) $l->duration_months : null] : null];
    }
}
