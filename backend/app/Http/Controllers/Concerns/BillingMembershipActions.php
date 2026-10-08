<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait BillingMembershipActions
{
    public function changeMembership(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $plan = strtolower((string) $request->input('plan'));
        $cycle = strtolower((string) $request->input('cycle', 'monthly'));
        if (! in_array($plan, ['starter', 'builder', 'pro'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose Starter, Builder, or Pro.'], 422);
        }
        if (! in_array($cycle, ['monthly', 'annual'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose monthly or annual billing.'], 422);
        }

        $provider = strtolower((string) ($user->billing_provider ?? ''));
        if ($provider === 'manual') {
            $this->applySubscription($user, $plan, $cycle, 'manual');
            return $this->json([
                'ok' => true,
                'status' => 'completed',
                'user' => $this->userPayload($user->fresh()),
            ]);
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
