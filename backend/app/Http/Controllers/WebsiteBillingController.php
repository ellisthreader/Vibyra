<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\BillingCheckoutActions;
use App\Services\Billing\CreditDeductor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class WebsiteBillingController extends Controller
{
    use BillingCheckoutActions;

    public function __construct(public readonly CreditDeductor $deductor) {}

    public function checkout(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['ok' => false, 'error' => 'Please log in.'], 401);
        }

        $stripe = $this->stripe();
        if (! $stripe) {
            return $this->json(['ok' => false, 'error' => 'Stripe is not configured on the backend.'], 503);
        }

        return match ((string) $request->input('kind', 'subscription')) {
            'subscription' => $this->createSubscriptionCheckout($stripe, $user, $request),
            'topup' => $this->createTopupCheckout($stripe, $user, $request),
            default => $this->json(['ok' => false, 'error' => 'Unknown checkout kind.'], 422),
        };
    }

    public function portal(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['ok' => false, 'error' => 'Please log in.'], 401);
        }

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
        } catch (Throwable $error) {
            Log::error('Stripe portal session failed', ['error' => $error->getMessage()]);

            return $this->json(['ok' => false, 'error' => 'Could not open billing portal.'], 502);
        }

        return $this->json(['ok' => true, 'url' => $session->url]);
    }

    private function json(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status);
    }
}
