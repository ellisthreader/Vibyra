<?php

namespace App\Services\Billing;

use App\Models\User;
use Carbon\CarbonInterface;

class MembershipEntitlement
{
    private const PAID_PLANS = ['starter', 'builder', 'pro'];
    private const PROVIDERS = ['stripe', 'manual', 'iap-apple', 'iap-google'];

    public function active(User $user, ?CarbonInterface $at = null): bool
    {
        $plan = strtolower(trim((string) ($user->plan ?: 'free')));
        $provider = strtolower(trim((string) ($user->billing_provider ?? '')));
        $endsAt = $user->membership_ends_at;

        if (! in_array($plan, self::PAID_PLANS, true)
            || ! in_array($provider, self::PROVIDERS, true)
            || ! $endsAt) {
            return false;
        }

        return $endsAt->isAfter($at ?? now());
    }
}
