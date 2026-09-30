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
