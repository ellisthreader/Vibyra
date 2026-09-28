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

trait TestsBillingIapTransactions
{
    public function test_receipt_and_credit_grant_roll_back_together(): void
        {
            [$token] = $this->authenticatedUser('iap-atomic@example.test');
            $this->mock(IapReceiptVerifier::class, function ($mock): void {
                $mock->shouldReceive('verify')->once()->andReturn([
                    'transactionId' => 'atomic-transaction',
                    'originalTransactionId' => 'atomic-original',
                    'productId' => 'app.vibyra.topup.500',
                    'environment' => 'production',
                    'state' => 'purchased',
                    'expiresAt' => null,
                    'payload' => ['verified' => true],
                ]);
            });
            $this->mock(CreditDeductor::class, function ($mock): void {
                $mock->shouldReceive('grant')->once()->andThrow(new RuntimeException('ledger unavailable'));
            });

            $this->postJson('/api/billing/iap-receipt', [
                'platform' => 'apple',
                'productId' => 'app.vibyra.topup.500',
                'transactionId' => 'atomic-transaction',
                'receipt' => 'apple-receipt',
            ], ['Authorization' => "Bearer {$token}"])->assertStatus(400);

            $this->assertDatabaseCount('iap_receipts', 0);
            $this->assertDatabaseCount('credit_ledger', 0);
        }

    public function test_overlapping_claim_observes_reserved_receipt_and_applies_once(): void
        {
            [, $user] = $this->authenticatedUser('iap-overlap@example.test');
            $verified = [
                'transactionId' => 'overlap-transaction',
                'originalTransactionId' => 'overlap-original',
                'productId' => 'app.vibyra.topup.500',
                'environment' => 'production',
                'state' => 'purchased',
                'expiresAt' => null,
                'payload' => ['verified' => true],
            ];
            $applications = 0;
            $claimer = app(IapPurchaseClaimer::class);

            $result = $claimer->claim(
                $user,
                'apple',
                $verified['productId'],
                $verified['transactionId'],
                $verified,
                function () use (&$applications, $claimer, $user, $verified): void {
                    $applications++;
                    $overlap = $claimer->claim(
                        $user,
                        'apple',
                        $verified['productId'],
                        $verified['transactionId'],
                        $verified,
                        function () use (&$applications): void {
                            $applications++;
                        }
                    );
                    $this->assertTrue($overlap['idempotent']);
                }
            );

            $this->assertFalse($result['idempotent']);
            $this->assertSame(1, $applications);
            $this->assertDatabaseCount('iap_receipts', 1);
        }

    public function test_database_uniqueness_is_the_concurrent_claim_arbiter(): void
        {
            [, $firstUser] = $this->authenticatedUser('iap-race-one@example.test');
            [, $secondUser] = $this->authenticatedUser('iap-race-two@example.test');
            IapReceipt::create([
                'user_id' => $firstUser->id,
                'platform' => 'apple',
                'product_id' => 'app.vibyra.topup.500',
                'transaction_id' => 'race-transaction-one',
                'client_transaction_id' => 'race-transaction-one',
                'original_transaction_id' => 'race-original',
            ]);

            $this->expectException(QueryException::class);
            IapReceipt::create([
                'user_id' => $secondUser->id,
                'platform' => 'apple',
                'product_id' => 'app.vibyra.topup.500',
                'transaction_id' => 'race-transaction-two',
                'client_transaction_id' => 'race-transaction-two',
                'original_transaction_id' => 'race-original',
            ]);
        }
}
