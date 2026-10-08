<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Membership\Enrollment;
use App\Services\Vibes\{Purchases, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

class MembershipAppleRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private function transaction(User $user, string $id, string $product): array
    {
        return ['transactionId' => $id, 'originalTransactionId' => '10001', 'productId' => $product,
            'appAccountToken' => app(Wallet::class)->ensure($user)->account_token,
            'inAppOwnershipType' => 'PURCHASED', 'purchaseDate' => now()->subDay()->timestamp * 1000,
            'expiresDate' => now()->addMonth()->timestamp * 1000, 'price' => 19990, 'currency' => 'GBP',
            'bundleId' => 'app.vibyra.mobile', 'environment' => 'Production'];
    }

    private function signed(array $data): string
    {
        return 'fixture.'.rtrim(strtr(base64_encode(json_encode($data)), '+/', '-_'), '=').'.fixture';
    }

    public function test_modern_apple_history_recovers_renewals_once_without_cross_account_grants(): void
    {
        $key = openssl_pkey_new(self::openSslOptions(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']));
        openssl_pkey_export($key, $pem);
        config(['membership.enabled' => true, 'membership.trial_days' => 0,
            'vibes.apple_environment' => 'Production', 'vibes.apple_private_key' => $pem,
            'vibes.apple_issuer' => 'fixture-issuer', 'vibes.apple_key_id' => 'fixture-key']);
        $user = User::factory()->create(['credits_balance' => 0]);
        $other = User::factory()->create(['credits_balance' => 0]);
        foreach ([$user, $other] as $u) {
            app(Wallet::class)->ensure($u, 0);
            app(Enrollment::class)->migrate($u, 0);
        }
        $first = $this->transaction($user, '10001', 'app.vibyra.membership.pro.monthly.v2');
        app(Purchases::class)->apply($user->id, $first);
        $next = [...$first, 'transactionId' => '10002', 'purchaseDate' => $first['expiresDate'],
            'expiresDate' => now()->addMonths(2)->timestamp * 1000];
        $foreign = $this->transaction($other, '90001', 'app.vibyra.tokens.80.v2');
        Http::fake(['https://api.storekit.apple.com/inApps/v2/history/*' => Http::response([
            'signedTransactions' => array_map(fn ($t) => $this->signed($t), [$first, $next, $foreign]), 'hasMore' => false,
        ])]);
        $this->assertDatabaseCount('vibes_purchases', 0);
        $this->artisan('vibyra:reconcile-vibes-purchases')->assertSuccessful();
        $this->artisan('vibyra:reconcile-vibes-purchases')->assertSuccessful();
        $this->assertSame(2, DB::table('membership_periods')->where('provider', 'iap-apple')->count());
        $this->assertSame(600, app(Wallet::class)->payload($user->id)['available']);
        $this->assertSame(0, DB::table('membership_periods')->where('user_id', $other->id)->count());
        Http::assertSentCount(2);
    }
}
