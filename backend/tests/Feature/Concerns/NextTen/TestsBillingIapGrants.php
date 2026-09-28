<?php

namespace Tests\Feature\Concerns\NextTen;

use App\Models\IapReceipt;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Billing\CreditDeductor;
use App\Services\Billing\IapPurchaseClaimer;
use App\Services\Billing\IapReceiptVerifier;
use Illuminate\Database\QueryException;
use RuntimeException;

trait TestsBillingIapGrants
{
    public function test_dotted_subscription_sku_is_applied_and_restore_is_idempotent(): void
        {
            [$token] = $this->authenticatedUser('iap-subscription@example.test');
            $this->mock(IapReceiptVerifier::class, function ($mock): void {
                $mock->shouldReceive('verify')->twice()->andReturn([
                    'transactionId' => 'GPA.subscription',
                    'originalTransactionId' => 'GPA.subscription',
                    'productId' => 'app.vibyra.membership.pro.monthly',
                    'environment' => 'production',
                    'state' => 'active',
                    'expiresAt' => now()->addMonth(),
                    'payload' => ['verified' => true],
                ]);
            });
            $receipt = [
                'platform' => 'google',
                'productId' => 'app.vibyra.membership.pro.monthly',
                'transactionId' => 'GPA.subscription',
                'receipt' => 'subscription-token',
            ];

            $this->postJson('/api/billing/iap-receipt', $receipt, [
                'Authorization' => "Bearer {$token}",
            ])->assertOk()->assertJsonPath('user.plan', 'pro');

            $this->postJson('/api/billing/iap-receipt', $receipt, [
                'Authorization' => "Bearer {$token}",
            ])->assertOk()->assertJsonPath('idempotent', true);

            $this->assertSame(1, IapReceipt::count());
        }

    public function test_verified_google_topup_grants_credits_once(): void
        {
            [$token, $user] = $this->authenticatedUser('iap-topup@example.test');
            $startingCredits = $user->credits_balance;
            $this->mock(IapReceiptVerifier::class, function ($mock): void {
                $mock->shouldReceive('verify')->twice()->andReturn([
                    'transactionId' => 'GPA.topup',
                    'originalTransactionId' => 'GPA.topup',
                    'productId' => 'app.vibyra.topup.500',
                    'environment' => 'production',
                    'state' => 'purchased',
                    'expiresAt' => null,
                    'payload' => ['verified' => true],
                ]);
            });
            $receipt = [
                'platform' => 'google',
                'productId' => 'app.vibyra.topup.500',
                'transactionId' => 'GPA.topup',
                'receipt' => 'topup-token',
            ];

            $this->postJson('/api/billing/iap-receipt', $receipt, [
                'Authorization' => "Bearer {$token}",
            ])->assertOk();
            $this->postJson('/api/billing/iap-receipt', [
                ...$receipt,
                'transactionId' => 'forged-replay-id',
            ], [
                'Authorization' => "Bearer {$token}",
            ])->assertStatus(409);

            $this->assertSame($startingCredits + 500, $user->fresh()->credits_balance);
            $this->assertSame(1, IapReceipt::count());
        }
}
