<?php

namespace Tests\Feature;

use App\Http\Middleware\VibesLegacyGuard;
use App\Models\{User, VibyraSession};
use App\Services\Vibes\{AppleStore, Purchases, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Tests\Feature\Support\PinnedVibesTrial;
use Tests\TestCase;

class VibesPurchasesTest extends TestCase
{
    use PinnedVibesTrial;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pinTrial();
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        openssl_pkey_export($key, $pem);
        config(['vibes.enabled' => true, 'vibes.purchases_enabled' => true, 'vibes.apple_private_key' => $pem,
            'vibes.apple_issuer' => 'fixture-issuer', 'vibes.apple_key_id' => 'fixture-key', 'vibes.apple_environment' => 'Sandbox',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
    }

    private function signed(array $payload): string { return 'fixture.'.rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=').'.fixture'; }

    private function transaction(User $u, string $id = '10001'): array
    {
        $w = app(Wallet::class)->ensure($u);
        return ['transactionId' => $id, 'originalTransactionId' => '10001', 'productId' => 'app.vibyra.vibes.starter.monthly',
            'appAccountToken' => $w->account_token, 'inAppOwnershipType' => 'PURCHASED',
            'purchaseDate' => now()->timestamp * 1000, 'expiresDate' => now()->addMonth()->timestamp * 1000,
            'bundleId' => config('vibes.apple_bundle_id'), 'environment' => 'Sandbox'];
    }

    public function test_restore_verifies_apple_identity_and_duplicate_delivery_grants_once(): void
    {
        $u = User::factory()->create(); $t = $this->transaction($u);
        VibyraSession::create(['user_id' => $u->id, 'token_hash' => hash('sha256', 'test-phone'), 'device_name' => 'iPhone']);
        Http::fake(['https://api.storekit-sandbox.apple.com/*' => Http::response(['signedTransactionInfo' => $this->signed($t)])]);
        $this->withToken('test-phone');
        $body = ['transactionId' => '10001', 'productId' => $t['productId']];
        $this->postJson('/api/vibes/purchases', $body)->assertOk()->assertJsonPath('wallet.available', 450);
        $this->postJson('/api/vibes/purchases', $body)->assertOk()->assertJsonPath('wallet.available', 450);
        $this->assertDatabaseCount('vibes_purchases', 1);
        $this->assertDatabaseCount('vibes_grants', 2);
        $this->postJson('/api/vibes/purchases', [...$body, 'productId' => 'app.vibyra.vibes.builder.monthly'])->assertStatus(409);
        Http::assertSent(function ($r) {
            $jwt = explode('.', substr($r->header('Authorization')[0], 7));
            return count($jwt) === 3 && strlen(base64_decode(strtr($jwt[2], '-_', '+/'))) === 64
                && json_decode(base64_decode(strtr($jwt[1], '-_', '+/')), true)['aud'] === 'appstoreconnect-v1';
        });
    }

    public function test_untrusted_notification_cannot_override_the_authoritative_transaction(): void
    {
        $u = User::factory()->create(); $other = User::factory()->create();
        $real = $this->transaction($u); $forged = $this->transaction($other);
        $forged['productId'] = 'app.vibyra.vibes.builder.monthly';
        Http::fakeSequence()->push(['signedTransactionInfo' => $this->signed($real)])
            ->push(['signedTransactionInfo' => $this->signed([...$real, 'bundleId' => 'wrong.app'])]);
        $payload = $this->signed(['data' => ['signedTransactionInfo' => $this->signed($forged)]]);
        $this->postJson('/api/vibes/apple-notifications', ['signedPayload' => $payload])->assertOk();
        $this->assertSame(450, app(Wallet::class)->payload($u->id)['available']);
        $this->assertSame(100, app(Wallet::class)->payload($other->id)['available']);
        $this->postJson('/api/vibes/apple-notifications', ['signedPayload' => $payload])->assertStatus(422);
    }

    public function test_history_pages_recover_missed_renewals_without_duplicating_old_credits(): void
    {
        $u = User::factory()->create(); $first = $this->transaction($u); $next = $this->transaction($u, '10002');
        $next['purchaseDate'] = $first['expiresDate']; $next['expiresDate'] = now()->addMonths(2)->timestamp * 1000;
        app(Purchases::class)->apply($u->id, $first);
        Http::fakeSequence()->push(['signedTransactions' => [$this->signed($first)], 'hasMore' => true, 'revision' => 'page-two'])
            ->push(['signedTransactions' => [$this->signed($next)], 'hasMore' => false]);
        $this->artisan('vibyra:reconcile-vibes-purchases')->assertSuccessful();
        $this->assertSame(800, app(Wallet::class)->payload($u->id)['available']);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'revision=page-two'));
    }

    public function test_legacy_free_route_cannot_multiply_allowance_and_paid_accounts_pass_through(): void
    {
        $u = User::factory()->create(['plan' => 'free']); app(Wallet::class)->ensure($u);
        VibyraSession::create(['user_id' => $u->id, 'token_hash' => hash('sha256', 'legacy'), 'device_name' => 'Legacy']);
        $request = Request::create('/api/chat', 'POST'); $request->headers->set('Authorization', 'Bearer legacy');
        $guard = new VibesLegacyGuard; $next = fn () => response('passed', 204);
        $this->assertSame(409, $guard->handle($request, $next)->status());
        $codex = Request::create('/api/codex/responses', 'POST'); $codex->headers->set('Authorization', 'Bearer legacy');
        $this->assertSame(409, $guard->handle($codex, $next)->status());
        $u->update(['plan' => 'starter']);
        $this->assertSame(204, $guard->handle($request, $next)->status());
        config(['vibes.apple_private_key' => null]);
        $this->assertFalse(app(Wallet::class)->payload($u->id)['purchasesEnabled']);
    }
    public function test_plan_switches_do_not_multiply_a_period_allowance_in_either_delivery_order(): void
    {
        foreach ([false, true] as $reverse) {
            $u = User::factory()->create(); $first = $this->transaction($u, $reverse ? '20001' : '10001');
            $first['originalTransactionId'] = $first['transactionId'];
            $upgrade = [...$first, 'transactionId' => $reverse ? '20002' : '10002', 'productId' => 'app.vibyra.vibes.builder.monthly'];
            foreach ($reverse ? [$upgrade, $first] : [$first, $upgrade] as $t) app(Purchases::class)->apply($u->id, $t);
            $this->assertSame(1100, app(Wallet::class)->payload($u->id)['available']);
            $this->assertSame('builder', app(Wallet::class)->payload($u->id)['plan']);
        }
    }
}
