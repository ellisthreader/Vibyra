<?php

namespace App\Services\Account;

use RuntimeException;
use Stripe\Exception\InvalidRequestException;
use Stripe\StripeClient;

class StripeSubscriptionCancellation
{
    public function cancel(string $subscriptionId): void
    {
        $secret = trim((string) config('services.stripe.secret', ''));
        if ($secret === '') {
            throw new RuntimeException('Stripe is not configured for account deletion cancellation.');
        }

        $stripe = new StripeClient($secret);
        try {
            $subscription = $stripe->subscriptions->retrieve($subscriptionId);
            if ($subscription->status === 'canceled') {
                return;
            }
            $stripe->subscriptions->cancel($subscriptionId);
        } catch (InvalidRequestException $error) {
            try {
                if ($stripe->subscriptions->retrieve($subscriptionId)->status === 'canceled') {
                    return;
                }
            } catch (InvalidRequestException) {
                // A missing subscription could be a wrong Stripe environment.
                // Leave the cleanup pending for billing review.
            }
            throw $error;
        }
    }
}
