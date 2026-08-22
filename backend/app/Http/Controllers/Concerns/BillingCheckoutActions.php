<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Stripe\StripeClient;

trait BillingCheckoutActions
{
    use BillingWebhookActions;

    private function createSubscriptionCheckout(StripeClient $stripe, User $user, Request $request): JsonResponse
    {
        $plan = (string) $request->input('plan');
        $cycle = (string) $request->input('cycle', 'monthly');
        if (! in_array($plan, ['starter', 'builder', 'pro'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose Starter, Builder, or Pro.'], 422);
        }
        if (! in_array($cycle, ['monthly', 'annual'], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose monthly or annual billing.'], 422);
        }
        $priceId = (string) config("billing.stripe_prices.{$plan}.{$cycle}");
        if ($priceId === '') {
            return $this->json(['ok' => false, 'error' => 'This plan is not yet available for purchase.'], 503);
        }

        $customerId = $this->ensureStripeCustomer($stripe, $user);
        $session = $stripe->checkout->sessions->create([
            'mode' => 'subscription',
            'customer' => $customerId,
            'line_items' => [['price' => $priceId, 'quantity' => 1]],
            'success_url' => (string) config('services.stripe.success_url'),
            'cancel_url' => (string) config('services.stripe.cancel_url'),
            'metadata' => ['userId' => (string) $user->id, 'plan' => $plan, 'cycle' => $cycle],
            'subscription_data' => ['metadata' => ['userId' => (string) $user->id, 'plan' => $plan, 'cycle' => $cycle]],
            'allow_promotion_codes' => (bool) config('billing.economics.allow_stripe_promotion_codes', false),
        ]);

        return $this->json(['ok' => true, 'url' => $session->url]);
    }

    private function createTopupCheckout(StripeClient $stripe, User $user, Request $request): JsonResponse
    {
        $topupKey = (string) $request->input('topup');
        $topup = (array) config("billing.topups.{$topupKey}", []);
        if ($topup === []) {
            return $this->json(['ok' => false, 'error' => 'Unknown top-up.'], 422);
        }
        $priceId = (string) env((string) ($topup['stripe_price_env'] ?? ''));
        if ($priceId === '') {
            return $this->json(['ok' => false, 'error' => 'This top-up is not yet available for purchase.'], 503);
        }

        $customerId = $this->ensureStripeCustomer($stripe, $user);
        $session = $stripe->checkout->sessions->create([
            'mode' => 'payment',
            'customer' => $customerId,
            'line_items' => [['price' => $priceId, 'quantity' => 1]],
            'success_url' => (string) config('services.stripe.success_url'),
            'cancel_url' => (string) config('services.stripe.cancel_url'),
            'metadata' => ['userId' => (string) $user->id, 'topup' => $topupKey],
            'payment_intent_data' => ['metadata' => ['userId' => (string) $user->id, 'topup' => $topupKey]],
        ]);

        return $this->json(['ok' => true, 'url' => $session->url]);
    }

    private function ensureStripeCustomer(StripeClient $stripe, User $user): string
    {
        if ($user->stripe_customer_id) {
            return $user->stripe_customer_id;
        }
        $customer = $stripe->customers->create([
            'email' => $user->email,
            'name' => $user->name,
            'metadata' => ['userId' => (string) $user->id],
        ]);
        $user->forceFill(['stripe_customer_id' => $customer->id])->save();

        return $customer->id;
    }

    private function stripe(): ?StripeClient
    {
        $secret = (string) config('services.stripe.secret');

        return $secret === '' ? null : new StripeClient($secret);
    }
}
