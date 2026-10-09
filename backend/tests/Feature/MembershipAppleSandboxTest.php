<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Membership\Enrollment;
use App\Services\Vibes\{Purchases, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

class MembershipAppleSandboxTest extends TestCase
{
    use RefreshDatabase;

    private User $tester;
    private User $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $key = openssl_pkey_new(self::openSslOptions(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']));
        openssl_pkey_export($key, $pem);
        config(['membership.enabled' => true, 'membership.apple_enabled' => false, 'membership.trial_days' => 0,
            'legal.paid_sales_enabled' => true, 'vibes.apple_environment' => 'Production',
            'vibes.apple_private_key' => $pem, 'vibes.apple_issuer' => 'fixture', 'vibes.apple_key_id' => 'fixture']);
        $this->tester = $this->account('tester-phone');
        $this->customer = $this->account('customer-phone');
        config(['vibes.apple_sandbox_user_ids' => [(string) $this->tester->id]]);
        Http::preventStrayRequests();
    }

    private function account(string $token): User
    {
        $user = User::factory()->create(['credits_balance' => 0, 'email_verified_at' => now()]);
        app(Wallet::class)->ensure($user, 0);
        app(Enrollment::class)->migrate($user, 0);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'iPhone']);
        return $user;
    }

    private function transaction(User $user, string $environment, string $id = '10001'): array
    {
        return ['transactionId' => $id, 'originalTransactionId' => $id, 'productId' => 'app.vibyra.tokens.80.v2',
            'appAccountToken' => app(Wallet::class)->ensure($user)->account_token, 'inAppOwnershipType' => 'PURCHASED',
            'purchaseDate' => now()->getTimestampMs(), 'price' => 4990, 'currency' => 'GBP',
            'bundleId' => 'app.vibyra.mobile', 'environment' => $environment];
    }

    private function signed(array $data): string
    {
        return 'fixture.'.rtrim(strtr(base64_encode(json_encode($data)), '+/', '-_'), '=').'.fixture';
    }

    private function body(array $t): array
    {
        return ['transactionId' => $t['transactionId'], 'productId' => $t['productId']];
    }

    public function test_only_the_configured_tester_can_see_and_preflight_sandbox_offers(): void
    {
        $wallet = app(Wallet::class)->payload($this->tester->id);
        $this->assertTrue($wallet['purchasesEnabled']);
        $this->assertTrue($wallet['salesCapabilities']['apple']);
        $this->assertNotContains(false, array_column($wallet['products'], 'appleEnabled'));
        $customer = app(Wallet::class)->payload($this->customer->id);
        $this->assertFalse($customer['purchasesEnabled']);
        $this->assertNotContains(true, array_column($customer['products'], 'appleEnabled'));
        $body = ['productId' => 'app.vibyra.tokens.80.v2'];
        $this->withToken('tester-phone')->postJson('/api/vibes/purchases/preflight', $body)->assertOk();
        $this->withToken('customer-phone')->postJson('/api/vibes/purchases/preflight', $body)->assertStatus(409);
        config(['vibes.apple_private_key' => null]);
        $this->assertFalse(app(Wallet::class)->payload($this->tester->id)['purchasesEnabled']);
    }

    public function test_sandbox_claim_restore_and_refund_are_verified_and_idempotent(): void
    {
        $t = $this->transaction($this->tester, 'Sandbox');
        $refunded = [...$t, 'revocationDate' => now()->getTimestampMs()];
        Http::fake(['https://api.storekit-sandbox.apple.com/inApps/v1/transactions/*' => Http::sequence()
            ->push(['signedTransactionInfo' => $this->signed($t)])
            ->push(['signedTransactionInfo' => $this->signed($t)])
            ->push(['signedTransactionInfo' => $this->signed($refunded)])]);
        $this->withToken('tester-phone')->postJson('/api/vibes/purchases', $this->body($t))->assertOk()->assertJsonPath('wallet.available', 80);
        $this->postJson('/api/vibes/purchases', $this->body($t))->assertOk()->assertJsonPath('wallet.available', 80);
        $payload = $this->signed(['data' => ['signedTransactionInfo' => $this->signed($t)]]);
        $this->postJson('/api/vibes/apple-notifications', ['signedPayload' => $payload])->assertOk();
        $this->assertSame(0, app(Wallet::class)->payload($this->tester->id)['available']);
        $this->assertDatabaseCount('membership_periods', 1);
        $this->assertDatabaseHas('membership_periods', ['reference' => 'apple:Sandbox:10001', 'refunded_minor' => 4990]);
        $this->assertSame('Production', config('vibes.apple_environment'));
    }

    public function test_client_or_notification_cannot_grant_sandbox_tokens_to_an_unlisted_account(): void
    {
        $t = $this->transaction($this->customer, 'Sandbox');
        Http::fake(['https://api.storekit.apple.com/*' => Http::response(['signedTransactionInfo' => $this->signed($t)]),
            'https://api.storekit-sandbox.apple.com/*' => Http::response(['signedTransactionInfo' => $this->signed($t)])]);
        $this->withToken('customer-phone')->postJson('/api/vibes/purchases', [...$this->body($t), 'environment' => 'Sandbox'])->assertStatus(422);
        Http::assertSent(fn ($r) => str_starts_with($r->url(), 'https://api.storekit.apple.com/'));
        $payload = $this->signed(['data' => ['signedTransactionInfo' => $this->signed($t)]]);
        $this->postJson('/api/vibes/apple-notifications', ['signedPayload' => $payload])->assertStatus(422);
        $this->assertDatabaseCount('membership_periods', 0);
        $this->assertSame(0, app(Wallet::class)->payload($this->customer->id)['available']);
    }

    public function test_recovery_keeps_production_and_sandbox_histories_separate(): void
    {
        $sandbox = $this->transaction($this->tester, 'Sandbox');
        $production = $this->transaction($this->customer, 'Production', '20001');
        foreach ([$sandbox, $production] as $i => $t) {
            app(Purchases::class)->apply($i === 0 ? $this->tester->id : $this->customer->id, $t);
        }
        $history = fn ($t, $id) => Http::response(['signedTransactions' => [$this->signed($t),
            $this->signed([...$t, 'transactionId' => $id, 'originalTransactionId' => $id])], 'hasMore' => false]);
        Http::fake(['https://api.storekit-sandbox.apple.com/inApps/v2/history/*' => $history($sandbox, '10002'),
            'https://api.storekit.apple.com/inApps/v2/history/*' => $history($production, '20002')]);
        $this->artisan('vibyra:reconcile-vibes-purchases')->assertSuccessful();
        $this->artisan('vibyra:reconcile-vibes-purchases')->assertSuccessful();
        foreach ([$this->tester, $this->customer] as $user) $this->assertSame(160, app(Wallet::class)->payload($user->id)['available']);
        $this->assertSame(2, DB::table('membership_periods')->where('environment', 'Sandbox')->count());
        $this->assertSame(2, DB::table('membership_periods')->where('environment', 'Production')->count());
        Http::assertSentCount(4);
    }
}
