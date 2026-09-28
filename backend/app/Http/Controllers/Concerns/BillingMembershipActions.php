<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait BillingMembershipActions
{
    public function changeMembership(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        if (\App\Services\Membership\Units::modern($user->id)) {
            $provider = app(\App\Services\Membership\Entitlements::class)->for($user)['provider'];
            if ($provider === 'stripe') return $this->portal($request);
            if ($provider === 'iap-apple') return $this->json(['ok' => true, 'url' => 'https://apps.apple.com/account/subscriptions']);
            return $this->json(['ok' => false, 'error' => 'There is no active membership to manage.'], 422);
        }
        $plan = strtolower((string) $request->input('plan'));
        $cycle = strtolower((string) $request->input('cycle', 'monthly'));
        if (! in_array($plan, ['starter', 'builder', 'pro'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose Starter, Builder, or Pro.'], 422);
        }
        if (! in_array($cycle, ['monthly', 'annual'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose monthly or annual billing.'], 422);
        }

        $provider = strtolower((string) ($user->billing_provider ?? ''));
        // Manual memberships are granted by support; letting the account pick its
        // own plan here would be a free upgrade and a free credit refill.
        if ($provider === 'manual') {
            return $this->json([
                'ok' => false,
                'error' => 'Contact billing support to change this membership.',
            ], 422);
        }
        if ($provider === 'stripe') {
            return $this->portal($request);
        }
        if ($provider === 'iap-apple') {
            return $this->json(['ok' => true, 'url' => 'https://apps.apple.com/account/subscriptions']);
        }
        if ($provider === 'iap-google') {
            return $this->json(['ok' => true, 'url' => 'https://play.google.com/store/account/subscriptions']);
        }

        return $this->json([
            'ok' => false,
            'error' => 'Contact billing support to change this membership.',
        ], 422);
    }
}
