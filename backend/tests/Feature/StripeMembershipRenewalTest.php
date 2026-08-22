<?php

namespace Tests\Feature;

use App\Http\Controllers\Concerns\BillingCheckoutActions;
use App\Models\User;
use App\Services\Billing\CreditDeductor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Stripe\Event;
use Tests\TestCase;

class StripeMembershipRenewalTest extends TestCase
{
    use RefreshDatabase;

    public function test_paid_invoice_advances_membership_to_invoice_period_end(): void
    {
        Carbon::setTestNow('2026-07-17 12:00:00');
        $paidThrough = now()->addMonth()->timestamp;
        $user = User::factory()->create([
            'plan' => 'builder',
            'plan_billing_cycle' => 'monthly',
            'billing_provider' => 'stripe',
            'stripe_customer_id' => 'cus_renewal',
            'stripe_subscription_id' => 'sub_renewal',
            'membership_ends_at' => now()->addDay(),
        ]);
        $event = Event::constructFrom([
            'type' => 'invoice.paid',
            'data' => ['object' => [
                'id' => 'in_renewal',
                'object' => 'invoice',
                'status' => 'paid',
                'customer' => 'cus_renewal',
                'subscription' => 'sub_renewal',
                'lines' => ['data' => [[
                    'period' => ['end' => $paidThrough],
                ]]],
            ]],
        ]);

        (new StripeRenewalHarness(app(CreditDeductor::class)))->dispatch($event);

        $this->assertSame($paidThrough, $user->fresh()->membership_ends_at->timestamp);
        Carbon::setTestNow();
    }
}

class StripeRenewalHarness
{
    use BillingCheckoutActions {
        handleWebhookEvent as public dispatch;
    }

    public function __construct(public CreditDeductor $deductor) {}

    private function completeProviderCancellationFeedback(User $user): void {}

    private function json(array $payload, int $status = 200)
    {
        return response()->json($payload, $status);
    }
}
