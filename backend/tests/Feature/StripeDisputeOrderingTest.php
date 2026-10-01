<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CloudWorkspaces\Eligibility;
use App\Services\Membership\{Enrollment, StripeEvents, StripeReconciliation};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use Stripe\{Event, StripeClient};
use Tests\TestCase;

final class StripeDisputeOrderingTest extends TestCase
{
    use RefreshDatabase;
    private User $user;
    private string $order;
    private StripeClient $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('a', 32)), 'membership.enabled' => true, 'membership.stripe_environment' => 'test',
            'membership.offers.pro_monthly.stripe' => 'price_pro', 'cloud_workspaces.enabled' => true,
            'cloud_workspaces.pilot_users' => []]);
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0, 'stripe_customer_id' => 'cus_test']);
        app(Wallet::class)->ensure($this->user, 0); app(Enrollment::class)->migrate($this->user, 0);
        $this->order = (string) Str::uuid();
        DB::table('membership_orders')->insert(['id' => $this->order, 'user_id' => $this->user->id,
            'offer_key' => 'pro_monthly', 'offer_version' => config('membership.version'), 'price_id' => 'price_pro',
            'customer_id' => 'cus_test', 'created_at' => now(), 'updated_at' => now()]);
        $this->stripe = Mockery::mock(StripeClient::class);
        $responses = [
            'charges' => fn ($id) => ['id' => $id, 'payment_intent' => $id === 'ch_other' ? 'pi_other' : 'pi_paid',
                'invoice' => $id === 'ch_other' ? 'in_other' : 'in_paid', 'amount_refunded' => $id === 'ch_other' ? 1999 : 0],
            'invoices' => fn ($id) => ['id' => $id, 'status' => 'paid', 'subscription' => 'sub_test', 'customer' => 'cus_test',
                'amount_paid' => 1999, 'currency' => 'gbp', 'payment_intent' => $id === 'in_other' ? 'pi_other' : 'pi_paid',
                'lines' => ['data' => [['price' => ['id' => 'price_pro'], 'quantity' => 1,
                    'period' => ['start' => time(), 'end' => time() + 2592000]]]]],
            'subscriptions' => fn () => ['id' => 'sub_test', 'metadata' => ['membershipOrder' => $this->order], 'status' => 'active'],
            'paymentIntents' => fn () => ['metadata' => []],
            'disputes' => fn () => ['id' => 'dp_test', 'status' => 'won'],
        ];
        foreach ($responses as $name => $response) {
            $service = Mockery::mock();
            $service->shouldReceive('retrieve')->andReturnUsing(fn ($id) => json_decode(json_encode($response($id))));
            $this->stripe->shouldReceive('getService')->with($name)->andReturn($service);
        }
    }

    private function event(string $id, string $type, array $object): Event
    {
        return Event::constructFrom(['id' => $id, 'livemode' => false, 'type' => $type, 'data' => ['object' => $object]]);
    }
    private function deliver(Event $event): void { app(StripeEvents::class)->handle($event, $this->stripe); }
    private function defer(Event $event): void
    {
        try { $this->deliver($event); $this->fail('Early reversal must wait for the paid grant.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
    }
    private function pending(): bool { return (bool) DB::table('membership_orders')->where('id', $this->order)->value('refund_pending'); }

    public function test_won_dispute_before_paid_invoice_event_can_restore_funded_work_after_replay(): void
    {
        $won = $this->event('evt_won', 'charge.dispute.closed', ['id' => 'dp_test', 'charge' => 'ch_paid']);
        $this->defer($won); $this->assertTrue($this->pending());
        $this->deliver($this->event('evt_paid', 'invoice.paid', ['id' => 'in_paid']));
        $this->deliver($won); $this->deliver($won);
        app(StripeReconciliation::class)->fail('stripe:test:evt_won'); // A slower duplicate fails after success.
        $this->assertFalse($this->pending(), 'A processed won dispute must release its own reconciliation hold.');
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
        app(Eligibility::class)->authorize($this->user->id);
        $this->assertSame('processed', DB::table('membership_events')->where('id', 'stripe:test:evt_won')->value('status'));
    }

    public function test_resolving_dispute_does_not_release_other_payment_refund_on_same_subscription_order(): void
    {
        $won = $this->event('evt_won', 'charge.dispute.closed', ['id' => 'dp_test', 'charge' => 'ch_paid']);
        $refund = $this->event('evt_refund', 'charge.refunded', ['id' => 'ch_other']);
        $this->defer($won); $this->defer($refund);
        DB::table('membership_events')->where('id', 'stripe:test:evt_refund')->update(['status' => 'processing']);
        $this->deliver($this->event('evt_paid', 'invoice.paid', ['id' => 'in_paid']));
        $this->deliver($won);
        $this->assertTrue($this->pending(), 'Other payment reversal is still unresolved.');
        try { app(Eligibility::class)->authorize($this->user->id); $this->fail('Funding reopened before the refund reconciled.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        $this->deliver($this->event('evt_other_paid', 'invoice.paid', ['id' => 'in_other']));
        $this->deliver($refund); $this->deliver($refund);
        $this->assertFalse($this->pending());
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
        app(Eligibility::class)->authorize($this->user->id);
    }

    public function test_unmapped_pre_upgrade_reversal_keeps_hold_until_its_canonical_replay(): void
    {
        $won = $this->event('evt_won', 'charge.dispute.closed', ['id' => 'dp_test', 'charge' => 'ch_paid']);
        $refund = $this->event('evt_refund', 'charge.refunded', ['id' => 'ch_other']);
        $this->defer($won); $this->defer($refund);
        DB::table('membership_events')->where('id', 'stripe:test:evt_refund')->update(['order_id' => null]);
        $this->deliver($this->event('evt_paid', 'invoice.paid', ['id' => 'in_paid'])); $this->deliver($won);
        $this->assertTrue($this->pending());
        $this->deliver($this->event('evt_other_paid', 'invoice.paid', ['id' => 'in_other'])); $this->deliver($refund);
        app(StripeReconciliation::class)->refreshResolved(50);
        $this->assertFalse($this->pending());
        $this->assertSame($this->order, DB::table('membership_events')->where('id', 'stripe:test:evt_refund')->value('order_id'));
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
    }

    public function test_unassociated_finish_cannot_overwrite_association_made_between_read_and_update(): void
    {
        $id = 'stripe:test:evt_race';
        DB::table('membership_events')->insert(['id' => $id, 'type' => 'charge.refunded', 'status' => 'pending',
            'payload' => 'unused', 'created_at' => now(), 'updated_at' => now()]);
        $armed = true;
        DB::listen(function ($query) use (&$armed, $id) {
            if ($armed && str_starts_with($query->sql, 'select') && str_contains($query->sql, 'membership_events')) {
                $armed = false;
                $this->assertTrue(app(StripeReconciliation::class)->track($id, $this->order));
            }
        });
        try { app(StripeReconciliation::class)->finish($id, false); $this->fail('Stale classification was accepted.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        $this->assertTrue($this->pending());
        $this->assertSame('processing', DB::table('membership_events')->where('id', $id)->value('status'));
        app(StripeReconciliation::class)->finish($id, true);
        app(StripeReconciliation::class)->fail($id);
        $this->assertSame('processed', DB::table('membership_events')->where('id', $id)->value('status'));
        $this->assertFalse($this->pending());
    }

    public function test_tracking_does_not_resurrect_legacy_classification_or_clear_unattributed_hold(): void
    {
        DB::table('membership_events')->insert(['id' => 'stripe:test:evt_legacy', 'type' => 'charge.refunded', 'status' => 'legacy',
            'payload' => 'unused', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('membership_orders')->where('id', $this->order)->update(['refund_pending' => true]);
        $this->assertFalse(app(StripeReconciliation::class)->track('stripe:test:evt_legacy', $this->order));
        app(StripeReconciliation::class)->refreshResolved(50);
        $this->assertTrue($this->pending(), 'A pre-upgrade hold with no associated evidence needs explicit review.');
    }

    public function test_processed_unmapped_pre_upgrade_won_event_is_selected_and_repaired(): void
    {
        $won = $this->event('evt_upgrade', 'charge.dispute.closed', ['id' => 'dp_test', 'charge' => 'ch_paid']);
        $this->defer($won);
        $this->deliver($this->event('evt_paid', 'invoice.paid', ['id' => 'in_paid']));
        DB::table('membership_events')->where('id', 'stripe:test:evt_upgrade')->update(['status' => 'processed', 'order_id' => null]);
        $this->assertSame(['stripe:test:evt_upgrade'], app(StripeReconciliation::class)->replayable(50)->pluck('id')->all());
        $this->deliver($won); $this->deliver($won);
        $this->assertFalse($this->pending());
        $this->assertSame($this->order, DB::table('membership_events')->where('id', 'stripe:test:evt_upgrade')->value('order_id'));
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
        app(Eligibility::class)->authorize($this->user->id);
    }

    public function test_unmapped_test_event_cannot_hold_live_order_or_enter_live_replay(): void
    {
        config(['membership.stripe_environment' => 'live']);
        DB::table('membership_events')->insert(['id' => 'stripe:test:evt_old', 'type' => 'charge.refunded',
            'status' => 'failed', 'payload' => 'unused', 'created_at' => now(), 'updated_at' => now()]);
        $won = $this->event('evt_live', 'charge.dispute.closed', ['id' => 'dp_test', 'charge' => 'ch_paid']);
        $won->livemode = true; $this->defer($won);
        $this->assertSame(['stripe:live:evt_live'], app(StripeReconciliation::class)->replayable(50)->pluck('id')->all());
        $paid = $this->event('evt_paid', 'invoice.paid', ['id' => 'in_paid']); $paid->livemode = true;
        $this->deliver($paid); $this->deliver($won);
        $this->assertFalse($this->pending());
        $this->assertSame('failed', DB::table('membership_events')->where('id', 'stripe:test:evt_old')->value('status'));
        app(Eligibility::class)->authorize($this->user->id);
    }
}
