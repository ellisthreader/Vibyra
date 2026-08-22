<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Referrals\ReferralService;
use Illuminate\Support\Carbon;
use Stripe\Event;

trait BillingWebhookActions
{
    private function handleWebhookEvent(Event $event): void
    {
        match ((string) $event->type) {
            'checkout.session.completed' => $this->handleCompletedCheckout($event->data->object),
            'customer.subscription.updated', 'customer.subscription.deleted' =>
                $this->handleSubscriptionLifecycle($event),
            'invoice.payment_failed' => $this->handleFailedInvoice($event->data->object),
            'invoice.paid' => $this->handlePaidInvoice($event->data->object),
            default => null,
        };
    }

    private function handleCompletedCheckout(object $session): void
    {
        $user = User::find((int) ($session->metadata->userId ?? 0));
        if (! $user) {
            return;
        }
        $this->assertStripeCustomerMatches($user, (string) ($session->customer ?? ''));

        if (($session->mode ?? '') === 'subscription') {
            if (! in_array((string) ($session->payment_status ?? ''), ['paid', 'no_payment_required'], true)) {
                throw new \RuntimeException('Stripe subscription checkout is not paid.');
            }
            $plan = (string) ($session->metadata->plan ?? '');
            $cycle = (string) ($session->metadata->cycle ?? 'monthly');
            $subscriptionId = $this->stripeSubscriptionId($session);
            if (! in_array($plan, ['starter', 'builder', 'pro'], true)
                || ! in_array($cycle, ['monthly', 'annual'], true)
                || $subscriptionId === '') {
                throw new \RuntimeException('Stripe subscription metadata is invalid.');
            }
            $this->applySubscription($user, $plan, $cycle, 'stripe', $subscriptionId, "stripe-subscription:{$subscriptionId}");
            return;
        }

        if (($session->mode ?? '') === 'payment') {
            if ((string) ($session->payment_status ?? '') !== 'paid') {
                throw new \RuntimeException('Stripe top-up checkout is not paid.');
            }
            $topupKey = (string) ($session->metadata->topup ?? '');
            $credits = (int) config("billing.topups.{$topupKey}.credits", 0);
            if ($credits > 0) {
                $this->deductor->grant($user, $credits, 'topup', 'stripe:'.$session->id, ['topup' => $topupKey]);
            }
        }
    }

    private function handleSubscriptionLifecycle(Event $event): void
    {
        $subscription = $event->data->object;
        $user = User::where('stripe_subscription_id', $subscription->id)->first()
            ?: (isset($subscription->metadata->userId) ? User::find((int) $subscription->metadata->userId) : null);
        if (! $user) {
            return;
        }
        $this->assertStripeCustomerMatches($user, (string) ($subscription->customer ?? ''));
        $status = (string) ($subscription->status ?? '');
        if ($event->type === 'customer.subscription.deleted'
            || in_array($status, ['canceled', 'incomplete', 'incomplete_expired', 'past_due', 'paused', 'unpaid'], true)) {
            if ($event->type === 'customer.subscription.deleted' || $status === 'canceled') {
                $this->completeProviderCancellationFeedback($user);
            }
            $this->revokePaidPlan($user);
            return;
        }

        $this->advanceMembershipEnd($user, $this->paidThroughFrom($subscription));
    }

    private function handleFailedInvoice(object $invoice): void
    {
        $subscriptionId = $this->stripeSubscriptionId($invoice);
        $user = $subscriptionId === '' ? null : User::where('stripe_subscription_id', $subscriptionId)->first();
        if ($user) {
            $this->assertStripeCustomerMatches($user, (string) ($invoice->customer ?? ''));
            $this->revokePaidPlan($user);
        }
    }

    private function handlePaidInvoice(object $invoice): void
    {
        $subscriptionId = $this->stripeSubscriptionId($invoice);
        $user = $subscriptionId === '' ? null : User::where('stripe_subscription_id', $subscriptionId)->first();
        if (! $user) {
            return;
        }
        if ((string) ($invoice->status ?? 'paid') !== 'paid') {
            throw new \RuntimeException('Stripe invoice.paid event did not contain a paid invoice.');
        }
        $this->assertStripeCustomerMatches($user, (string) ($invoice->customer ?? ''));
        $fallback = ($user->plan_billing_cycle ?: 'monthly') === 'annual' ? now()->addYear() : now()->addMonth();
        $this->advanceMembershipEnd($user, $this->paidThroughFrom($invoice) ?? $fallback);
        $allowance = $this->allowanceFor($user->plan, $user->plan_billing_cycle ?: 'monthly');
        $this->deductor->refresh(
            $user,
            $allowance,
            ['source' => 'stripe.invoice.paid', 'invoice' => $invoice->id],
            'stripe-invoice:'.$invoice->id
        );
    }

    private function applySubscription(User $user, string $plan, string $cycle, string $provider, ?string $subscriptionId = null, ?string $ledgerReference = null): void
    {
        $wasPaid = $user->plan !== 'free';
        $allowance = $this->allowanceFor($plan, $cycle);
        $user->forceFill([
            'plan' => $plan,
            'plan_billing_cycle' => $cycle,
            'plan_renews_at' => now()->addMonth(),
            'membership_ends_at' => $cycle === 'annual' ? now()->addYear() : now()->addMonth(),
            'membership_cancel_at_period_end' => false,
            'stripe_subscription_id' => $subscriptionId ?: $user->stripe_subscription_id,
            'billing_provider' => $provider,
        ])->save();
        $this->deductor->refresh($user, $allowance, ['source' => $provider, 'plan' => $plan, 'cycle' => $cycle], $ledgerReference);
        if (! $wasPaid && $plan !== 'free') {
            app(ReferralService::class)->recordPaidConversion($user, $plan, $provider);
        }
    }

    private function revokePaidPlan(User $user): void
    {
        $user->forceFill([
            'plan' => 'free', 'plan_billing_cycle' => 'monthly', 'plan_renews_at' => null,
            'membership_ends_at' => null, 'membership_cancel_at_period_end' => false,
            'stripe_subscription_id' => null, 'billing_provider' => null,
        ])->save();
    }

    private function allowanceFor(string $plan, string $cycle): int
    {
        $config = (array) config("billing.plans.{$plan}", []);
        return (int) ($cycle === 'annual'
            ? ($config['annual_credits'] ?? $config['monthly_credits'] ?? 0)
            : ($config['monthly_credits'] ?? 0));
    }

    private function advanceMembershipEnd(User $user, ?Carbon $paidThrough): void
    {
        if ($paidThrough && (! $user->membership_ends_at || $paidThrough->isAfter($user->membership_ends_at))) {
            $user->forceFill(['membership_ends_at' => $paidThrough])->save();
        }
    }

    private function paidThroughFrom(object $object): ?Carbon
    {
        $timestamps = [(int) ($object->current_period_end ?? 0), (int) ($object->period_end ?? 0)];
        foreach ((array) ($object->items->data ?? $object->lines->data ?? []) as $item) {
            $timestamps[] = (int) ($item->current_period_end ?? $item->period->end ?? 0);
        }
        $timestamp = max($timestamps);
        return $timestamp > 0 ? Carbon::createFromTimestamp($timestamp) : null;
    }

    private function stripeSubscriptionId(object $object): string
    {
        return trim((string) ($object->subscription
            ?? $object->parent->subscription_details->subscription
            ?? ''));
    }

    private function assertStripeCustomerMatches(User $user, string $eventCustomerId): void
    {
        $known = (string) ($user->stripe_customer_id ?? '');
        if ($known !== '' && ($eventCustomerId === '' || ! hash_equals($known, $eventCustomerId))) {
            throw new \RuntimeException('Stripe event customer does not match the billing account.');
        }
    }
}
