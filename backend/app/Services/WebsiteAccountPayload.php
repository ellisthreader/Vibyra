<?php

namespace App\Services;

use App\Models\User;
use App\Services\Billing\MembershipEntitlement;

class WebsiteAccountPayload
{
    public function __construct(private readonly MembershipEntitlement $entitlement) {}

    public function for(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'provider' => $user->provider ?: 'email',
            'emailVerified' => $user->hasVerifiedEmail(),
            'plan' => $user->plan ?: 'free',
            'planBillingCycle' => $user->plan_billing_cycle ?: 'monthly',
            'membershipActive' => $this->entitlement->active($user),
            'membershipEndsAt' => optional($user->membership_ends_at)->toIso8601String(),
            'membershipCancelAtPeriodEnd' => (bool) $user->membership_cancel_at_period_end,
            'billingProvider' => $user->billing_provider ?: null,
            'canManageStripeBilling' => $user->billing_provider === 'stripe'
                && (string) ($user->stripe_customer_id ?? '') !== '',
        ];
    }
}
