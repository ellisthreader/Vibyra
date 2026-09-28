<?php

namespace Tests\Feature;

use App\Models\MembershipCancellationFeedback;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingCancellationTest extends TestCase
{
    use RefreshDatabase;

    public function test_cancellation_requires_reason_and_confirmation(): void
    {
        [$user, $token] = $this->paidUser('cancel-validation@example.test', 'manual');

        $this->postJson('/api/billing/cancel', [], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422);
        $this->assertDatabaseCount('membership_cancellation_feedback', 0);
    }

    public function test_manual_cancellation_keeps_access_until_paid_term_ends(): void
    {
        [$user, $token] = $this->paidUser('manual-cancel@example.test', 'manual');
        $endsAt = now()->addMonths(8)->startOfSecond();
        $user->forceFill(['membership_ends_at' => $endsAt])->save();

        $this->postJson('/api/billing/cancel', [
            'reason' => 'too_expensive',
            'details' => 'Testing the cancellation flow.',
            'confirmed' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('status', 'scheduled')
            ->assertJsonPath('user.plan', 'pro')
            ->assertJsonPath('user.membershipCancelAtPeriodEnd', true)
            ->assertJsonPath('effectiveAt', $endsAt->toIso8601String());

        $this->assertDatabaseHas('membership_cancellation_feedback', [
            'user_id' => $user->id,
            'billing_provider' => 'manual',
            'reason' => 'too_expensive',
            'status' => 'scheduled',
        ]);
        $this->assertDatabaseMissing('credit_ledger', ['kind' => 'refresh']);
    }

    public function test_iap_cancellation_records_feedback_and_returns_provider_url(): void
    {
        [$user, $token] = $this->paidUser('apple-cancel@example.test', 'iap-apple');

        $this->postJson('/api/billing/cancel', [
            'reason' => 'temporary_break',
            'confirmed' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('status', 'provider_action_required')
            ->assertJsonPath('url', 'https://apps.apple.com/account/subscriptions');

        $this->assertDatabaseHas('membership_cancellation_feedback', [
            'user_id' => $user->id,
            'reason' => 'temporary_break',
            'status' => 'provider_action_required',
        ]);
    }

    public function test_stripe_webhook_completes_pending_cancellation_feedback(): void
    {
        config(['services.stripe.webhook_secret' => 'whsec_test']);
        [$user] = $this->paidUser('stripe-cancel@example.test', 'stripe');
        $user->forceFill(['stripe_subscription_id' => 'sub_cancel_test'])->save();
        MembershipCancellationFeedback::create([
            'user_id' => $user->id,
            'plan' => 'pro',
            'billing_cycle' => 'annual',
            'billing_provider' => 'stripe',
            'reason' => 'missing_features',
            'status' => 'provider_action_required',
            'confirmed_at' => now(),
        ]);
        $payload = json_encode([
            'id' => 'evt_cancel_test',
            'object' => 'event',
            'type' => 'customer.subscription.deleted',
            'data' => ['object' => [
                'id' => 'sub_cancel_test',
                'object' => 'subscription',
                'status' => 'canceled',
                'metadata' => ['userId' => (string) $user->id],
            ]],
        ], JSON_UNESCAPED_SLASHES);
        $timestamp = time();
        $signature = hash_hmac('sha256', "{$timestamp}.{$payload}", 'whsec_test');

        $this->call('POST', '/api/billing/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$signature}",
        ], $payload)->assertOk();

        $this->assertDatabaseHas('membership_cancellation_feedback', [
            'user_id' => $user->id,
            'status' => 'completed',
        ]);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'plan' => 'free']);
    }

    private function paidUser(string $email, string $provider): array
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Cancellation User',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $user = User::where('email', $email)->firstOrFail();
        $user->forceFill([
            'plan' => 'pro',
            'plan_billing_cycle' => 'annual',
            'billing_provider' => $provider,
            'credits_balance' => 4950,
        ])->save();

        return [$user, $token];
    }
}
