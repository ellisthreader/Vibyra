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

trait TestsBillingIapOwnership
{
    public function test_verified_apple_topup_cannot_be_replayed_with_a_forged_transaction_id(): void
        {
            [$token, $user] = $this->authenticatedUser('iap-apple-topup@example.test');
            $startingCredits = $user->credits_balance;
            $this->mock(IapReceiptVerifier::class, function ($mock): void {
                $mock->shouldReceive('verify')->twice()->andReturn([
                    'transactionId' => 'apple-transaction',
                    'originalTransactionId' => 'apple-original-topup',
                    'productId' => 'app.vibyra.topup.500',
                    'environment' => 'production',
                    'state' => 'purchased',
                    'expiresAt' => null,
                    'payload' => ['verified' => true],
                ]);
            });
            $receipt = [
                'platform' => 'apple',
                'productId' => 'app.vibyra.topup.500',
                'transactionId' => 'apple-transaction',
                'receipt' => 'apple-receipt',
            ];

            $headers = ['Authorization' => "Bearer {$token}"];
            $this->postJson('/api/billing/iap-receipt', $receipt, $headers)->assertOk();
            $this->postJson('/api/billing/iap-receipt', [
                ...$receipt,
                'transactionId' => 'forged-apple-replay-id',
            ], $headers)->assertStatus(409);

            $this->assertSame($startingCredits + 500, $user->fresh()->credits_balance);
            $this->assertSame(1, IapReceipt::count());
        }

    public function test_verified_purchase_cannot_be_claimed_by_another_user(): void
        {
            [$firstToken] = $this->authenticatedUser('iap-owner@example.test');
            [$secondToken] = $this->authenticatedUser('iap-attacker@example.test');
            $this->mock(IapReceiptVerifier::class, function ($mock): void {
                $mock->shouldReceive('verify')->twice()->andReturn([
                    'transactionId' => 'apple-owned-transaction',
                    'originalTransactionId' => 'apple-owned-original',
                    'productId' => 'app.vibyra.topup.500',
                    'environment' => 'production',
                    'state' => 'purchased',
                    'expiresAt' => null,
                    'payload' => ['verified' => true],
                ]);
            });
            $receipt = [
                'platform' => 'apple',
                'productId' => 'app.vibyra.topup.500',
                'transactionId' => 'apple-owned-transaction',
                'receipt' => 'apple-receipt',
            ];

            $this->postJson('/api/billing/iap-receipt', $receipt, [
                'Authorization' => "Bearer {$firstToken}",
            ])->assertOk();
            $this->postJson('/api/billing/iap-receipt', $receipt, [
                'Authorization' => "Bearer {$secondToken}",
            ])->assertStatus(409);

            $this->assertDatabaseCount('iap_receipts', 1);
            $this->assertDatabaseCount('credit_ledger', 1);
        }

    public function test_verified_product_must_match_requested_product(): void
        {
            [$token] = $this->authenticatedUser('iap-wrong-product@example.test');
            $this->mock(IapReceiptVerifier::class, function ($mock): void {
                $mock->shouldReceive('verify')->once()->andReturn([
                    'transactionId' => 'wrong-product-transaction',
                    'originalTransactionId' => 'wrong-product-original',
                    'productId' => 'app.vibyra.topup.1500',
                    'environment' => 'production',
                    'state' => 'purchased',
                    'expiresAt' => null,
                    'payload' => ['verified' => true],
                ]);
            });

            $this->postJson('/api/billing/iap-receipt', [
                'platform' => 'apple',
                'productId' => 'app.vibyra.topup.500',
                'transactionId' => 'wrong-product-transaction',
                'receipt' => 'apple-receipt',
            ], ['Authorization' => "Bearer {$token}"])->assertStatus(409);

            $this->assertDatabaseCount('iap_receipts', 0);
            $this->assertDatabaseCount('credit_ledger', 0);
        }
}
