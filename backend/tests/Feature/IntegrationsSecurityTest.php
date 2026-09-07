<?php

namespace Tests\Feature;

use App\Models\IntegrationConnection;
use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Tests\Feature\Concerns\IntegrationFixtures;
use Tests\TestCase;

class IntegrationsSecurityTest extends TestCase
{
    use IntegrationFixtures, RefreshDatabase;

    public function test_owner_and_session_boundaries(): void
    {
        $this->fakeProvider('gmail');
        [$attempt, $q] = $this->start('gmail');
        VibyraSession::query()->create(['user_id' => User::factory()->create()->id, 'token_hash' => hash('sha256', 'other-token')]);
        $this->rpc(['operation' => 'poll', 'id' => $attempt], 'other-token')->assertNotFound();
        $this->complete('gmail', $q);
        $id = IntegrationConnection::query()->first()->id;
        $this->rpc(['operation' => 'list'], 'other-token')->assertJsonCount(0, 'connections');
        $this->rpc(['operation' => 'grant', 'id' => $id, 'enabled' => true], 'other-token')->assertNotFound();
        $this->rpc(['operation' => 'list'], 'invalid-token')->assertUnauthorized();
    }

    public function test_wrong_state_service_and_signed_out_callback_are_rejected(): void
    {
        $this->fakeProvider('gmail');
        [$id, $q] = $this->start('gmail');
        $this->complete('outlook', $q);
        $this->complete('gmail', ['state' => str_repeat('x', 64)]);
        $this->session->revoke('logout');
        $this->complete('gmail', $q);
        Http::assertNothingSent();
        $this->assertDatabaseCount('integration_connections', 0);
    }

    public function test_store_hosts_and_hmac_are_checked_before_exchange(): void
    {
        foreach (['localhost', 'https://my-shop.myshopify.com', 'my-shop.myshopify.com.evil.test', 'my-shop.myshopify.com@evil.test'] as $shop) {
            $this->rpc(['operation' => 'start', 'service' => 'shopify', 'shop' => $shop])->assertStatus(422);
        }
        [$id, $q] = $this->start('shopify');
        $this->get('/api/integrations/callback/shopify?'.http_build_query(['state' => $q['state'], 'code' => 'code',
            'shop' => 'my-shop.myshopify.com', 'hmac' => str_repeat('0', 64)]))->assertOk();
        Http::assertNothingSent();
        $this->assertDatabaseCount('integration_connections', 0);
    }

    public function test_no_generic_urls_or_write_operations_exist(): void
    {
        $this->rpc(['operation' => 'write', 'url' => 'https://evil.test'])->assertUnprocessable();
        $this->rpc(['operation' => 'start', 'service' => 'protonmail'])->assertUnprocessable();
        Http::assertNothingSent();
    }

    public function test_revoked_provider_access_requires_reconnect(): void
    {
        $id = $this->connect('gmail');
        Http::swap(new Factory);
        Http::fake(fn () => Http::response([], 401));
        $this->rpc(['operation' => 'check', 'id' => $id])->assertStatus(409);
        $this->assertSame('reconnect', IntegrationConnection::query()->find($id)->status);
    }

    public function test_shopify_uninstall_requires_signature_and_is_idempotent(): void
    {
        $id = $this->connect('shopify');
        $body = '{"shop_id":123}';
        $headers = ['CONTENT_TYPE' => 'application/json', 'HTTP_X_SHOPIFY_SHOP_DOMAIN' => 'my-shop.myshopify.com',
            'HTTP_X_SHOPIFY_TRIGGERED_AT' => now()->addSecond()->toRfc3339String(),
            'HTTP_X_SHOPIFY_TOPIC' => 'app/uninstalled', 'HTTP_X_SHOPIFY_HMAC_SHA256' => 'wrong'];
        $this->call('POST', '/api/integrations/shopify/webhook', [], [], [], $headers, $body)->assertUnauthorized();
        $this->assertDatabaseHas('integration_connections', ['id' => $id]);
        $headers['HTTP_X_SHOPIFY_HMAC_SHA256'] = base64_encode(hash_hmac('sha256', $body, 'fixture-secret', true));
        $old = $headers;
        $old['HTTP_X_SHOPIFY_TRIGGERED_AT'] = now()->subDay()->toRfc3339String();
        $this->call('POST', '/api/integrations/shopify/webhook', [], [], [], $old, $body)->assertOk();
        $this->assertDatabaseHas('integration_connections', ['id' => $id]);
        $other = '{"shop_id":999}';
        $wrongShop = $headers;
        $wrongShop['HTTP_X_SHOPIFY_HMAC_SHA256'] = base64_encode(hash_hmac('sha256', $other, 'fixture-secret', true));
        $this->call('POST', '/api/integrations/shopify/webhook', [], [], [], $wrongShop, $other)->assertOk();
        $this->assertDatabaseHas('integration_connections', ['id' => $id]);
        $this->call('POST', '/api/integrations/shopify/webhook', [], [], [], $headers, $body)->assertOk();
        $this->call('POST', '/api/integrations/shopify/webhook', [], [], [], $headers, $body)->assertOk();
        $this->assertDatabaseMissing('integration_connections', ['id' => $id]);
    }
}
