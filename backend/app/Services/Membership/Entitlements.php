<?php

namespace App\Services\Membership;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/** One effective entitlement for admission and every presentation. */
final class Entitlements
{
    public function for(User $user): array
    {
        $periods = DB::table('membership_periods')->where('user_id', $user->id)->whereNull('revoked_at')
            ->where('disputed', false)->where('starts_at', '<=', now())->where('ends_at', '>', now())->orderByDesc('ends_at')->get();
        // Keep a real subscription's billing controls visible even when a license ends later.
        $p = $periods->first(fn ($p) => !in_array($p->provider, [Trials::PROVIDER, 'license']))
            ?? $periods->first(fn ($p) => $p->provider === 'license') ?? $periods->first();
        if ($p) return ['tier' => 'pro', 'plan' => 'pro_v2', 'provider' => $p->provider,
            'trial' => $p->provider === Trials::PROVIDER, 'offerKey' => $p->offer_key,
            'paidUntil' => $p->ends_at, 'cancelAtEnd' => (bool) $p->cancel_at_end,
            // A trial has no subscription, so only real subscriptions can conflict.
            'conflict' => $periods->pluck('subscription_id')->filter()->unique()->count() > 1,
            'priceAmount' => (string) $p->paid_minor, 'priceScale' => $p->money_scale, 'currency' => $p->currency];
        $w = DB::table('vibes_wallets')->where('user_id', $user->id)->first();
        if ($w && $w->paid_until && now()->lt($w->paid_until) && $w->plan !== 'pro_v2') {
            return ['tier' => 'pro', 'plan' => $w->plan, 'provider' => 'iap-apple', 'paidUntil' => $w->paid_until];
        }
        if ($user->membership_ends_at?->isFuture() && in_array($user->plan, ['starter', 'builder', 'pro'])) {
            return ['tier' => 'pro', 'plan' => $user->plan, 'provider' => $user->billing_provider,
                'paidUntil' => $user->membership_ends_at->toIso8601String(), 'cancelAtEnd' => (bool) $user->membership_cancel_at_period_end];
        }
        return ['tier' => 'free', 'plan' => 'free', 'provider' => null, 'paidUntil' => null];
    }

    /** A paid subscription is active. A trial is not one, so trial accounts can still buy Pro. */
    public function subscribed(User $user): bool
    {
        if (DB::table('membership_periods')->where('user_id', $user->id)->whereNull('revoked_at')
            ->where('disputed', false)->whereNotIn('provider', [Trials::PROVIDER, 'license'])
            ->where('starts_at', '<=', now())->where('ends_at', '>', now())->exists()) return true;
        $w = DB::table('vibes_wallets')->where('user_id', $user->id)->first();
        return ($w && $w->paid_until && now()->lt($w->paid_until) && $w->plan !== 'pro_v2')
            || ($user->membership_ends_at?->isFuture() && in_array($user->plan, ['starter', 'builder', 'pro']));
    }
}
