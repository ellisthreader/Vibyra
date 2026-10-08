<?php

namespace Tests\Feature\Teams;

use App\Services\Teams\{SeatBilling, Seats};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Stripe\StripeClient;
use Tests\Support\TeamsFixture;
use Tests\TestCase;

/** Roadmap Part 13: seats in membership config and Stripe quantity handling, flagged off. Stripe is a Mockery fake; nothing is called for real. */
class TeamsSeatsTest extends TestCase
{
    use RefreshDatabase, TeamsFixture;

    private $org;
    private $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootTeams();
        [$this->org, $this->owner] = $this->team();
    }

    private function billingOn(): void
    {
        config(['membership.enabled' => true, 'membership.stripe_enabled' => true, 'membership.teams.billing_enabled' => true,
            'membership.teams.stripe_price' => 'price_team_seat', 'services.stripe.secret' => 'sk_test_fake']);
    }

    private function stripe(?callable $expect = null): StripeClient
    {
        $items = Mockery::mock();
        if ($expect) $items->shouldReceive('update')->once()->andReturnUsing($expect);
        else $items->shouldNotReceive('update');
        $stripe = Mockery::mock(StripeClient::class);
        $stripe->shouldReceive('getService')->with('subscriptionItems')->andReturn($items);
        return $stripe;
    }

    public function test_the_team_price_lives_in_membership_config_off_and_outside_the_client_catalogue(): void
    {
        $t = config('membership.teams');
        $this->assertFalse($t['billing_enabled']);
        $this->assertSame('team_v2', $t['plan']);
        $this->assertSame(2, $t['min_seats']);
        $this->assertNull($t['seat_pence'], 'no price is stated until the owner sets one');
        $this->assertArrayNotHasKey('team_monthly', config('membership.offers'));
        $this->assertFalse(SeatBilling::enabled());
        $this->assertFalse(collect(app(\App\Services\Membership\Offers::class)->all())->contains(fn ($o) => str_contains($o['offerKey'], 'team')));
    }

    public function test_with_billing_off_nothing_is_built_or_sent(): void
    {
        $this->org->forceFill(['stripe_item_id' => 'si_1'])->save();
        $this->assertNull(app(SeatBilling::class)->syncIfEnabled($this->org->id));
        $this->assertNull(app(SeatBilling::class)->sync($this->org->fresh(), $this->stripe()));
        $this->assertFalse(app(SeatBilling::class)->applySubscription(['id' => 'sub_1', 'metadata' => ['organizationId' => $this->org->id],
            'items' => ['data' => [['id' => 'si_1', 'quantity' => 9, 'price' => ['id' => 'price_team_seat']]]]]));
        $this->assertNull($this->org->fresh()->seats);
    }

    public function test_quantity_counts_members_and_open_invitations_within_the_plan_bounds(): void
    {
        $this->billingOn();
        $billing = app(SeatBilling::class);
        $this->assertSame(2, $billing->quantity($this->org), 'one member is below the minimum');
        foreach (range(1, 4) as $_) $this->seat($this->org, $this->person());
        $this->assertSame(5, $billing->quantity($this->org));
        config(['membership.teams.max_seats' => 4]);
        $this->assertSame(4, $billing->quantity($this->org));
    }

    public function test_the_quantity_is_pushed_to_the_subscription_item_with_an_idempotency_key(): void
    {
        $this->billingOn();
        $this->org->forceFill(['stripe_item_id' => 'si_123', 'seats' => 2])->save();
        $this->seat($this->org, $this->person());
        $this->seat($this->org, $this->person());
        $pushed = app(SeatBilling::class)->sync($this->org->fresh(), $this->stripe(function ($id, $params, $opts) {
            $this->assertSame('si_123', $id);
            $this->assertSame(['quantity' => 3, 'proration_behavior' => 'create_prorations'], $params);
            $this->assertSame(['idempotency_key' => 'team-seats:'.$this->org->id.':3'], $opts);
            return (object) ['id' => 'si_123'];
        }));
        $this->assertSame(3, $pushed);
        // Already what Stripe reports, or no item yet: no call at all.
        $this->org->forceFill(['seats' => 3])->save();
        $this->assertNull(app(SeatBilling::class)->sync($this->org->fresh(), $this->stripe()));
        $this->org->forceFill(['seats' => 2, 'stripe_item_id' => null])->save();
        $this->assertNull(app(SeatBilling::class)->sync($this->org->fresh(), $this->stripe()));
    }

    public function test_stripes_view_of_the_subscription_sets_the_seats_and_ending_it_closes_the_door(): void
    {
        $this->billingOn();
        $billing = app(SeatBilling::class);
        $sub = fn (string $status = 'active', string $price = 'price_team_seat', int $qty = 5) => ['id' => 'sub_9', 'status' => $status,
            'metadata' => ['organizationId' => $this->org->id], 'items' => ['data' => [['id' => 'si_9', 'quantity' => $qty, 'price' => ['id' => $price]]]]];
        $this->assertFalse($billing->applySubscription($sub('active', 'price_other')));
        $this->assertFalse($billing->applySubscription(['id' => 'x', 'metadata' => ['organizationId' => 'nope'], 'items' => ['data' => []]]));
        $this->assertTrue($billing->applySubscription($sub()));
        $org = $this->org->fresh();
        $this->assertSame([5, 'sub_9', 'si_9'], [$org->seats, $org->stripe_subscription_id, $org->stripe_item_id]);
        $this->assertTrue($billing->applySubscription($sub('canceled')));
        $org = $this->org->fresh();
        $this->assertSame([0, null, null], [$org->seats, $org->stripe_subscription_id, $org->stripe_item_id]);
        $this->assertNotNull($this->memberOf($this->owner), 'nobody is removed when seats end');
    }

    public function test_each_member_keeps_their_own_wallet_there_is_no_shared_balance(): void
    {
        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasColumn('organizations', 'balance'));
        foreach (\Illuminate\Support\Facades\Schema::getColumnListing('organizations') as $c) $this->assertDoesNotMatchRegularExpression('/wallet|credit|token_balance/', $c);
    }

    public function test_members_and_seats_arithmetic(): void
    {
        $seats = app(Seats::class);
        $this->assertSame(1, $seats->members($this->org));
        $this->assertSame(0, $seats->pending($this->org));
        $this->assertSame(200, $seats->limit($this->org));
        $this->org->forceFill(['seats' => 5])->save();
        $this->assertSame(5, $seats->limit($this->org->fresh()));
    }
}
