<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\BillingCheckoutActions;
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
    use BillingCheckoutActions;
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

}
