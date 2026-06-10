<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Referrals\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Stripe\Event;
use Stripe\StripeClient;

trait BillingCheckoutActions
{
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
            'allow_promotion_codes' => (bool) config(
                'billing.economics.allow_stripe_promotion_codes',
                false
            ),
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

    private function handleWebhookEvent(Event $event): void
    {
        switch ($event->type) {
            case 'checkout.session.completed':
                $session = $event->data->object;
                $userId = (int) ($session->metadata->userId ?? 0);
                $user = $userId ? User::find($userId) : null;
                if (! $user) {
                    return;
                }
                $this->assertStripeCustomerMatches($user, (string) ($session->customer ?? ''));

                if ($session->mode === 'subscription') {
                    if (! in_array((string) ($session->payment_status ?? ''), ['paid', 'no_payment_required'], true)) {
                        throw new \RuntimeException('Stripe subscription checkout is not paid.');
                    }
                    $plan = (string) ($session->metadata->plan ?? '');
                    $cycle = (string) ($session->metadata->cycle ?? 'monthly');
                    $subscriptionId = (string) ($session->subscription ?? '');
                    if (! in_array($plan, ['starter', 'builder', 'pro'], true)
                        || ! in_array($cycle, ['monthly', 'annual'], true)
                        || $subscriptionId === '') {
                        throw new \RuntimeException('Stripe subscription metadata is invalid.');
                    }
                    $this->applySubscription(
                        $user,
                        $plan,
                        $cycle,
                        'stripe',
                        $subscriptionId,
                        "stripe-subscription:{$subscriptionId}"
                    );
                } elseif ($session->mode === 'payment') {
                    if ((string) ($session->payment_status ?? '') !== 'paid') {
                        throw new \RuntimeException('Stripe top-up checkout is not paid.');
                    }
                    $topupKey = (string) ($session->metadata->topup ?? '');
                    $topup = (array) config("billing.topups.{$topupKey}", []);
                    $credits = (int) ($topup['credits'] ?? 0);
                    if ($credits > 0) {
                        $this->deductor->grant($user, $credits, 'topup', 'stripe:'.$session->id, ['topup' => $topupKey]);
                    }
                }

                return;

            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                $sub = $event->data->object;
                $user = User::where('stripe_subscription_id', $sub->id)->first()
                    ?: (isset($sub->metadata->userId) ? User::find((int) $sub->metadata->userId) : null);
                if (! $user) {
                    return;
                }
                $this->assertStripeCustomerMatches($user, (string) ($sub->customer ?? ''));

                if ($event->type === 'customer.subscription.deleted'
                    || in_array($sub->status, [
                        'canceled', 'incomplete', 'incomplete_expired',
                        'past_due', 'paused', 'unpaid',
                    ], true)) {
                    if ($event->type === 'customer.subscription.deleted' || $sub->status === 'canceled') {
                        $this->completeProviderCancellationFeedback($user);
                    }
                    $this->revokePaidPlan($user);
                }

                return;

            case 'invoice.payment_failed':
                $invoice = $event->data->object;
                $subId = (string) ($invoice->subscription ?? '');
                $user = $subId !== ''
                    ? User::where('stripe_subscription_id', $subId)->first()
                    : null;
                if ($user) {
                    $this->assertStripeCustomerMatches($user, (string) ($invoice->customer ?? ''));
                    $this->revokePaidPlan($user);
                }

                return;

            case 'invoice.paid':
                $invoice = $event->data->object;
                $subId = (string) ($invoice->subscription ?? '');
                if ($subId === '') {
                    return;
                }
                $user = User::where('stripe_subscription_id', $subId)->first();
                if (! $user) {
                    return;
                }
                if ((string) ($invoice->status ?? 'paid') !== 'paid') {
                    throw new \RuntimeException('Stripe invoice.paid event did not contain a paid invoice.');
                }
                $this->assertStripeCustomerMatches($user, (string) ($invoice->customer ?? ''));
                // Renewal — refresh credits per current plan + cycle.
                $allowance = $this->allowanceFor($user->plan, $user->plan_billing_cycle ?: 'monthly');
                $this->deductor->refresh(
                    $user,
                    $allowance,
                    ['source' => 'stripe.invoice.paid', 'invoice' => $invoice->id],
                    'stripe-invoice:'.$invoice->id
                );

                return;
        }
    }

    private function applySubscription(
        User $user,
        string $plan,
        string $cycle,
        string $provider,
        ?string $subscriptionId = null,
        ?string $ledgerReference = null,
    ): void {
        $wasPaid = $user->plan !== 'free';
        $allowance = $this->allowanceFor($plan, $cycle);
        $user->forceFill([
            'plan' => $plan,
            'plan_billing_cycle' => $cycle,
            'plan_renews_at' => Carbon::now()->addMonth(),
            'membership_ends_at' => $cycle === 'annual' ? Carbon::now()->addYear() : Carbon::now()->addMonth(),
            'membership_cancel_at_period_end' => false,
            'stripe_subscription_id' => $subscriptionId ?: $user->stripe_subscription_id,
            'billing_provider' => $provider,
        ])->save();
        $this->deductor->refresh(
            $user,
            $allowance,
            ['source' => $provider, 'plan' => $plan, 'cycle' => $cycle],
            $ledgerReference
        );
        if (! $wasPaid && $plan !== 'free') {
            app(ReferralService::class)->recordPaidConversion($user, $plan, $provider);
        }
    }

    private function revokePaidPlan(User $user): void
    {
        $user->forceFill([
            'plan' => 'free',
            'plan_billing_cycle' => 'monthly',
            'plan_renews_at' => null,
            'membership_ends_at' => null,
            'membership_cancel_at_period_end' => false,
            'stripe_subscription_id' => null,
            'billing_provider' => null,
        ])->save();
    }

    private function allowanceFor(string $plan, string $cycle): int
    {
        $config = (array) config("billing.plans.{$plan}", []);

        return (int) ($cycle === 'annual'
            ? ($config['annual_credits'] ?? $config['monthly_credits'] ?? 0)
            : ($config['monthly_credits'] ?? 0));
    }

    private function assertStripeCustomerMatches(User $user, string $eventCustomerId): void
    {
        $knownCustomerId = (string) ($user->stripe_customer_id ?? '');
        if ($knownCustomerId !== '' && ($eventCustomerId === ''
            || ! hash_equals($knownCustomerId, $eventCustomerId))) {
            throw new \RuntimeException('Stripe event customer does not match the billing account.');
        }
    }

    private function stripe(): ?StripeClient
    {
        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            return null;
        }

        return new StripeClient($secret);
    }
}
