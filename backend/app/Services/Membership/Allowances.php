<?php

namespace App\Services\Membership;

use App\Models\User;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** The wallet lock always precedes the global enrollment lock. */
final class Allowances
{
    public function refresh(int $userId): void
    {
        DB::transaction(function () use ($userId) {
            $wallet = app(Wallet::class)->lock($userId);
            if ($wallet->billing_version != 2) return;
            $this->expire($userId);
            $user = User::findOrFail($userId);
            if ($user->isGuest() || !$user->hasVerifiedEmail()) return;
            if (!$wallet->free_enrolled_at && config('membership.free_enabled')) {
                DB::table('membership_capacity')->insertOrIgnore(['key' => 'free']);
                $capacity = DB::table('membership_capacity')->where('key', 'free')->lockForUpdate()->first();
                if ($capacity->enrolled < config('membership.free_accounts')) {
                    DB::table('membership_capacity')->where('key', 'free')->increment('enrolled');
                    DB::table('vibes_wallets')->where('user_id', $userId)->update([
                        'free_enrolled_at' => now(), 'free_next_at' => now()]);
                    $wallet->free_enrolled_at = now(); $wallet->free_next_at = now();
                }
            }
            if (!$wallet->free_enrolled_at || now()->lt($wallet->free_next_at)) return;
            // Calendar-month anniversary, anchored to enrollment, with no missed grants.
            $anchor = Carbon::parse($wallet->free_enrolled_at);
            $months = max(0, (now()->year - $anchor->year) * 12 + now()->month - $anchor->month);
            $start = $anchor->copy()->addMonthsNoOverflow($months);
            if ($start->isFuture()) $start = $anchor->copy()->addMonthsNoOverflow(--$months);
            $end = $anchor->copy()->addMonthsNoOverflow($months + 1);
            if (app(Entitlements::class)->for($user)['tier'] === 'free') {
                $ref = 'free:'.$userId.':'.$start->toDateString();
                app(Wallet::class)->grant($userId, $ref, 'trial', config('membership.free_tokens') * Units::SCALE);
                DB::table('vibes_grants')->where('reference', $ref)->update(['expires_at' => $end]);
            }
            DB::table('vibes_wallets')->where('user_id', $userId)->update(['free_next_at' => $end]);
        }, 3);
    }
    public function expire(int $userId): void
    {
        $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')
            ->where('expires_at', '<=', now())->get();
        foreach ($grants as $g) {
            DB::table('vibes_grants')->where('id', $g->id)->update(['remaining' => 0, 'revoked_at' => now()]);
            app(Wallet::class)->record($userId, 'expire:'.$g->id, 'expiry', -(int) $g->remaining);
        }
    }
}
