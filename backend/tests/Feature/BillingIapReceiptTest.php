<?php

namespace Tests\Feature;

use App\Models\IapReceipt;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Billing\CreditDeductor;
use App\Services\Billing\IapPurchaseClaimer;
use App\Services\Billing\IapReceiptVerifier;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class BillingIapReceiptTest extends TestCase
{
    use RefreshDatabase;

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

    /**
     * @return array{string, User}
     */
    private function authenticatedUser(string $email): array
    {
        $user = User::factory()->create([
            'name' => 'IAP Test User',
            'email' => $email,
            'credits_balance' => (int) config('billing.plans.free.monthly_credits'),
        ]);
        $token = 'iap-test-token-'.sha1($email);
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'last_used_at' => now(),
        ]);

        return [$token, $user];
    }
}
