<?php

namespace App\Services\Vibes;

use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Project the verified wallet into every account surface without duplicating its credits. */
class AccountMembership
{
    public function for(User $user, ?CarbonInterface $at = null): ?array
    {
        if ($user->exists && \App\Services\Membership\Units::modern($user->id)) {
            $m = app(\App\Services\Membership\Entitlements::class)->for($user);
            $e = app(Plans::class)->for($m['plan']);
            return ['plan' => $m['plan'], 'planBillingCycle' => 'monthly', 'membershipActive' => $m['tier'] !== 'free',
                'membershipEndsAt' => $m['paidUntil'], 'planRenewsAt' => null, 'creditsResetAt' => null,
                'billingProvider' => $m['provider'], 'membershipCancelAtPeriodEnd' => $m['cancelAtEnd'] ?? false,
                'canManageStripeBilling' => $m['provider'] === 'stripe' && (bool) $user->stripe_customer_id,
                'planPricePence' => $m['priceMinor'] ?? 0, 'billingCurrency' => strtolower($m['currency'] ?? 'GBP'),
                'maxConcurrentAgents' => $e['concurrentReplies'], 'maxActiveProjects' => $e['maxProjects'] ?? 0,
                'vibesBalance' => app(Wallet::class)->available($user->id) / 10000, 'vibesEntitlements' => $e];
        }
        if (!config('vibes.enabled')) return null;
        $wallet = DB::table('vibes_wallets')->where('user_id', $user->id)->first();
        if (!$wallet || !$wallet->paid_until || !($at ?? now())->lt($wallet->paid_until)) return null;
        $ranks = ['free' => 0, 'starter' => 1, 'builder' => 2, 'pro' => 3];
        // An existing higher legacy subscription still belongs to its billing provider.
        if ($user->membership_ends_at?->isAfter($at ?? now())
            && ($ranks[$wallet->plan] ?? 0) < ($ranks[$user->plan ?? 'free'] ?? 0)) return null;
        $ends = Carbon::parse($wallet->paid_until)->toIso8601String();
        $entitlements = app(Plans::class)->for($wallet->plan);
        $product = collect(config('vibes.products'))->first(fn ($p) => $p['kind'] === 'subscription' && $p['plan'] === $wallet->plan);
        return [
            'plan' => $wallet->plan, 'planBillingCycle' => 'monthly', 'membershipActive' => true,
            'membershipEndsAt' => $ends, 'planRenewsAt' => $ends, 'creditsResetAt' => $ends,
            'billingProvider' => 'iap-apple', 'canManageStripeBilling' => false,
            'membershipCancelAtPeriodEnd' => false,
            'planPricePence' => (int) ($product['pence'] ?? 0),
            'maxConcurrentAgents' => $entitlements['concurrentReplies'],
            'maxActiveProjects' => $entitlements['maxProjects'] ?? 0,
            'vibesBalance' => app(Wallet::class)->available($user->id),
            'vibesEntitlements' => $entitlements,
        ];
    }
}
