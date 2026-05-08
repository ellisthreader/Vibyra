<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Models\IapReceipt;
use App\Models\User;
use App\Services\Billing\CreditDeductor;
use App\Services\Billing\IapReceiptVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Stripe\Exception\SignatureVerificationException;
use Stripe\StripeClient;
use Stripe\Webhook;
use Throwable;

class BillingController extends Controller
{
    use UserPayloads;

    public function __construct(
        private readonly CreditDeductor $deductor,
        private readonly IapReceiptVerifier $iapVerifier,
    ) {
    }

    public function plans(): JsonResponse
    {
        $plans = collect(config('billing.plans', []))->map(function (array $config, string $key) {
            return [
                'key' => $key,
                'label' => $config['label'] ?? ucfirst($key),
                'monthlyCredits' => (int) ($config['monthly_credits'] ?? 0),
                'annualCredits' => (int) ($config['annual_credits'] ?? $config['monthly_credits'] ?? 0),
                'monthlyPricePence' => (int) ($config['monthly_price_pence'] ?? 0),
                'annualPricePence' => (int) ($config['annual_price_pence'] ?? 0),
                'allowedTiers' => array_values((array) ($config['allowed_tiers'] ?? [])),
                'dailyCreditCap' => (int) ($config['daily_credit_cap'] ?? 0),
                'maxConcurrentAgents' => (int) ($config['max_concurrent_agents'] ?? 0),
                'maxActiveProjects' => (int) ($config['max_active_projects'] ?? 0),
            ];
        })->values()->all();

        $topups = collect(config('billing.topups', []))->map(function (array $config, string $key) {
            return [
                'key' => $key,
                'credits' => (int) ($config['credits'] ?? 0),
                'pricePence' => (int) ($config['price_pence'] ?? 0),
            ];
        })->values()->all();

        return $this->json([
            'ok' => true,
            'plans' => $plans,
            'topups' => $topups,
            'currency' => 'gbp',
            'vatInclusive' => true,
        ]);
    }

    public function checkout(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $kind = (string) $request->input('kind', 'subscription');

        $stripe = $this->stripe();
        if (! $stripe) {
            return $this->json(['ok' => false, 'error' => 'Stripe is not configured on the backend.'], 503);
        }

        if ($kind === 'subscription') {
            return $this->createSubscriptionCheckout($stripe, $user, $request);
        }
        if ($kind === 'topup') {
            return $this->createTopupCheckout($stripe, $user, $request);
        }
        return $this->json(['ok' => false, 'error' => 'Unknown checkout kind.'], 422);
    }

    public function portal(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $stripe = $this->stripe();
        if (! $stripe) {
            return $this->json(['ok' => false, 'error' => 'Stripe is not configured on the backend.'], 503);
        }
        if (! $user->stripe_customer_id) {
            return $this->json(['ok' => false, 'error' => 'No Stripe customer on file. Subscribe via Stripe first to manage billing here.'], 422);
        }

        try {
            $session = $stripe->billingPortal->sessions->create([
                'customer' => $user->stripe_customer_id,
                'return_url' => (string) config('services.stripe.portal_return_url'),
            ]);
        } catch (Throwable $e) {
            Log::error('Stripe portal session failed', ['error' => $e->getMessage()]);
            return $this->json(['ok' => false, 'error' => 'Could not open billing portal.'], 502);
        }

        return $this->json(['ok' => true, 'url' => $session->url]);
    }

    public function webhook(Request $request): JsonResponse
    {
        $secret = (string) config('services.stripe.webhook_secret');
        if ($secret === '') {
            return response()->json(['ok' => false, 'error' => 'Webhook secret not configured.'], 503);
        }

        $payload = $request->getContent();
        $sigHeader = (string) $request->header('Stripe-Signature', '');

        try {
            $event = Webhook::constructEvent($payload, $sigHeader, $secret);
        } catch (SignatureVerificationException $e) {
            return response()->json(['ok' => false, 'error' => 'Invalid signature.'], 400);
        } catch (Throwable $e) {
            return response()->json(['ok' => false, 'error' => 'Invalid payload.'], 400);
        }

        try {
            $this->handleWebhookEvent($event);
        } catch (Throwable $e) {
            Log::error('Stripe webhook handler failed', ['type' => $event->type ?? 'unknown', 'error' => $e->getMessage()]);
            return response()->json(['ok' => false, 'error' => 'Handler failed.'], 500);
        }

        return response()->json(['ok' => true]);
    }

    public function iapReceipt(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $platform = strtolower((string) $request->input('platform', ''));
        $productId = (string) $request->input('productId', '');
        $transactionId = (string) $request->input('transactionId', '');
        $receipt = (string) $request->input('receipt', '');

        if (! in_array($platform, ['apple', 'google'], true)) {
            return $this->json(['ok' => false, 'error' => 'Unsupported IAP platform.'], 422);
        }
        if ($productId === '' || $transactionId === '' || $receipt === '') {
            return $this->json(['ok' => false, 'error' => 'Missing IAP fields.'], 422);
        }

        $product = (array) config("billing.iap_products.{$productId}", []);
        if (empty($product)) {
            return $this->json(['ok' => false, 'error' => 'Unknown IAP product.'], 422);
        }

        if (IapReceipt::where('platform', $platform)->where('transaction_id', $transactionId)->exists()) {
            return $this->json(['ok' => true, 'idempotent' => true, 'user' => $this->userPayload($user->fresh())]);
        }

        try {
            $verified = $this->iapVerifier->verify($platform, $productId, $receipt);
        } catch (Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], 400);
        }

        IapReceipt::create([
            'user_id' => $user->id,
            'platform' => $platform,
            'product_id' => $productId,
            'transaction_id' => $transactionId,
            'original_transaction_id' => $verified['originalTransactionId'] ?? null,
            'expires_at' => $verified['expiresAt'] ?? null,
            'payload' => $verified['payload'] ?? null,
        ]);

        if (($product['kind'] ?? '') === 'subscription') {
            $this->applySubscription($user, (string) $product['plan'], (string) $product['cycle'], 'iap-' . $platform);
        } else {
            $topup = (array) config("billing.topups.{$product['topup']}", []);
            $credits = (int) ($topup['credits'] ?? 0);
            if ($credits > 0) {
                $this->deductor->grant($user, $credits, 'topup', "iap-{$platform}:{$transactionId}", ['productId' => $productId]);
            }
        }

        return $this->json(['ok' => true, 'user' => $this->userPayload($user->fresh())]);
    }

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
            'allow_promotion_codes' => true,
        ]);

        return $this->json(['ok' => true, 'url' => $session->url]);
    }

    private function createTopupCheckout(StripeClient $stripe, User $user, Request $request): JsonResponse
    {
        $topupKey = (string) $request->input('topup');
        $topup = (array) config("billing.topups.{$topupKey}", []);
        if (empty($topup)) {
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

    private function handleWebhookEvent(\Stripe\Event $event): void
    {
        switch ($event->type) {
            case 'checkout.session.completed':
                $session = $event->data->object;
                $userId = (int) ($session->metadata->userId ?? 0);
                $user = $userId ? User::find($userId) : null;
                if (! $user) return;

                if ($session->mode === 'subscription') {
                    $plan = (string) ($session->metadata->plan ?? '');
                    $cycle = (string) ($session->metadata->cycle ?? 'monthly');
                    if ($plan !== '') {
                        $this->applySubscription($user, $plan, $cycle, 'stripe', (string) $session->subscription);
                    }
                } elseif ($session->mode === 'payment') {
                    $topupKey = (string) ($session->metadata->topup ?? '');
                    $topup = (array) config("billing.topups.{$topupKey}", []);
                    $credits = (int) ($topup['credits'] ?? 0);
                    if ($credits > 0) {
                        $this->deductor->grant($user, $credits, 'topup', 'stripe:' . $session->id, ['topup' => $topupKey]);
                    }
                }
                return;

            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                $sub = $event->data->object;
                $user = User::where('stripe_subscription_id', $sub->id)->first()
                    ?: (isset($sub->metadata->userId) ? User::find((int) $sub->metadata->userId) : null);
                if (! $user) return;

                if ($event->type === 'customer.subscription.deleted' || in_array($sub->status, ['canceled', 'incomplete_expired'], true)) {
                    $user->forceFill([
                        'plan' => 'free',
                        'plan_billing_cycle' => 'monthly',
                        'plan_renews_at' => null,
                        'stripe_subscription_id' => null,
                        'billing_provider' => null,
                    ])->save();
                }
                return;

            case 'invoice.paid':
                $invoice = $event->data->object;
                $subId = (string) ($invoice->subscription ?? '');
                if ($subId === '') return;
                $user = User::where('stripe_subscription_id', $subId)->first();
                if (! $user) return;
                // Renewal — refresh credits per current plan + cycle.
                $allowance = $this->allowanceFor($user->plan, $user->plan_billing_cycle ?: 'monthly');
                $this->deductor->refresh($user, $allowance, ['source' => 'stripe.invoice.paid', 'invoice' => $invoice->id]);
                return;
        }
    }

    private function applySubscription(User $user, string $plan, string $cycle, string $provider, ?string $subscriptionId = null): void
    {
        $allowance = $this->allowanceFor($plan, $cycle);
        $user->forceFill([
            'plan' => $plan,
            'plan_billing_cycle' => $cycle,
            'plan_renews_at' => $cycle === 'annual' ? Carbon::now()->addMonth() : Carbon::now()->addMonth(),
            'stripe_subscription_id' => $subscriptionId ?: $user->stripe_subscription_id,
            'billing_provider' => $provider,
        ])->save();
        $this->deductor->refresh($user, $allowance, ['source' => $provider, 'plan' => $plan, 'cycle' => $cycle]);
    }

    private function allowanceFor(string $plan, string $cycle): int
    {
        $config = (array) config("billing.plans.{$plan}", []);
        return (int) ($cycle === 'annual'
            ? ($config['annual_credits'] ?? $config['monthly_credits'] ?? 0)
            : ($config['monthly_credits'] ?? 0));
    }

    private function stripe(): ?StripeClient
    {
        $secret = (string) config('services.stripe.secret');
        if ($secret === '') return null;
        return new StripeClient($secret);
    }
}
