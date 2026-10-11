<?php

namespace App\Services\Teams;

use App\Models\Organization;
use Stripe\StripeClient;

/**
 * Stripe quantity for the Team seat price, written flagged off with the rest of Membership v2. Nothing here runs, and no Stripe
 * call is made, until MEMBERSHIP_V2_ENABLED, MEMBERSHIP_STRIPE_ENABLED and MEMBERSHIP_TEAMS_BILLING_ENABLED are all on and a seat
 * price id is configured. Stripe is the source of truth for `organizations.seats`: we push a quantity, then `applySubscription`
 * records what Stripe reports (from the subscription webhook). No shared wallet: seats size the team, never a token balance.
 * Not yet wired: routing Team checkout and `customer.subscription.*` events into `applySubscription` (see docs/teams-contract.md).
 */
final class SeatBilling
{
    public static function enabled(): bool
    {
        return (bool) (config('membership.enabled') && config('membership.stripe_enabled') && config('membership.teams.billing_enabled')
            && config('membership.teams.stripe_price'));
    }

    /** Seats to bill: everyone seated plus open invitations, never below the plan minimum or above the maximum. */
    public function quantity(Organization $org): int
    {
        $seats = app(Seats::class);
        $want = $seats->members($org) + $seats->pending($org);
        return max((int) config('membership.teams.min_seats'), min((int) config('membership.teams.max_seats'), $want));
    }

    /** Called after a membership or invitation change. A no-op while billing is off. */
    public function syncIfEnabled(string $organizationId): ?int
    {
        $secret = (string) config('services.stripe.secret');
        if (!self::enabled() || $secret === '') return null;
        $org = Organization::query()->find($organizationId);
        return $org ? $this->sync($org, new StripeClient($secret)) : null;
    }

    /** Push the quantity to the subscription item when it differs from what Stripe last reported. Returns the quantity pushed. */
    public function sync(Organization $org, StripeClient $stripe): ?int
    {
        if (!self::enabled() || !$org->stripe_item_id) return null;
        $quantity = $this->quantity($org);
        if ($org->seats === $quantity) return null;
        $stripe->subscriptionItems->update($org->stripe_item_id, ['quantity' => $quantity, 'proration_behavior' => 'create_prorations'],
            ['idempotency_key' => 'team-seats:'.$org->id.':'.$quantity]);
        return $quantity;
    }

    /**
     * Record Stripe's view of a Team subscription (the webhook payload, as an array): the seat price's quantity and ids. Matched by
     * the `organizationId` metadata set at checkout; unknown organizations and other prices are ignored. Seats below the current
     * member count never remove anyone, they only stop new invitations;
     * an ended subscription sets 0, which stops them too.
     */
    public function applySubscription(array $subscription): bool
    {
        if (!self::enabled()) return false;
        $org = Organization::query()->find((string) ($subscription['metadata']['organizationId'] ?? ''));
        if (!$org) return false;
        foreach ($subscription['items']['data'] ?? [] as $item) {
            if (($item['price']['id'] ?? null) !== config('membership.teams.stripe_price')) continue;
            $ended = in_array($subscription['status'] ?? '', ['canceled', 'incomplete_expired'], true);
            $org->forceFill(['seats' => $ended ? 0 : max(0, (int) ($item['quantity'] ?? 0)),
                'stripe_subscription_id' => $ended ? null : (string) $subscription['id'], 'stripe_item_id' => $ended ? null : (string) $item['id']])->save();
            return true;
        }
        return false;
    }
}
