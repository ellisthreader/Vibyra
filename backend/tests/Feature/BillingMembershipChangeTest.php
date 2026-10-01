<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingMembershipChangeTest extends TestCase
{
    use RefreshDatabase;

    public function test_manual_membership_cannot_self_upgrade_or_refill(): void
    {
        [$user, $token] = $this->paidUser('manual-change@example.test', 'manual');
        $before = $user->fresh()->only(['plan', 'plan_billing_cycle', 'credits_balance', 'plan_renews_at']);
        foreach (['starter', 'pro'] as $plan) {
            $this->postJson('/api/billing/change', ['plan' => $plan, 'cycle' => 'annual'],
                ['Authorization' => "Bearer {$token}"])->assertStatus(422)->assertJsonPath('ok', false);
        }
        $this->assertEquals($before, $user->fresh()->only(array_keys($before)));
    }

    public function test_store_membership_change_returns_provider_settings(): void
    {
        [, $token] = $this->paidUser('apple-change@example.test', 'iap-apple');

        $this->postJson('/api/billing/change', [
            'plan' => 'builder',
            'cycle' => 'annual',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('url', 'https://apps.apple.com/account/subscriptions');
    }

    public function test_membership_change_validates_plan_and_cycle(): void
    {
        [, $token] = $this->paidUser('invalid-change@example.test', 'manual');

        $this->postJson('/api/billing/change', [
            'plan' => 'enterprise',
            'cycle' => 'weekly',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)
            ->assertJsonPath('ok', false);
    }

    private function paidUser(string $email, string $provider): array
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Membership User',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $user = User::where('email', $email)->firstOrFail();
        $user->forceFill([
            'plan' => 'pro',
            'plan_billing_cycle' => 'annual',
            'billing_provider' => $provider,
            'credits_balance' => 3200,
        ])->save();

        return [$user, $token];
    }
}
