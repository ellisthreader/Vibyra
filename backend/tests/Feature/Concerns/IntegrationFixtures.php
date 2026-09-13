<?php

namespace Tests\Feature\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Integrations\Catalog;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

trait IntegrationFixtures
{
    private string $token;

    private VibyraSession $session;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://vibyra.test']);
        foreach (['google', 'microsoft', 'stripe', 'shopify', 'github'] as $provider) {
            config(["integrations.$provider" => ['client_id' => 'fixture-client', 'client_secret' => 'fixture-secret', 'mode' => 'test', 'install_url' => 'https://marketplace.stripe.com/oauth/v2/authorize?client_id=fixture-client&livemode=false']]);
        }
        $this->token = Str::random(60);
        $this->session = VibyraSession::query()->create(['user_id' => User::factory()->create()->id,
            'token_hash' => hash('sha256', $this->token), 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
        Http::preventStrayRequests();
    }

    private function rpc(array $payload, ?string $token = null)
    {
        return $this->withToken($token ?? $this->token)->postJson('/api/integrations/rpc',
            $payload + ['device' => 'device-a', 'agent' => 'agent-a']);
    }

    private function fakeProvider(string $service, ?callable $override = null): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(function ($request) use ($service, $override) {
            $custom = $override ? $override($request) : null;
            if ($custom) {
                return $custom;
            }
            $url = $request->url();
            if (str_contains($url, 'token')) {
                return Http::response(['access_token' => 'provider-access-secret',
                    'refresh_token' => 'provider-refresh-secret', 'scope' => Catalog::get($service)['scope'],
                    'expires_in' => 3600, 'stripe_user_id' => 'acct_123', 'livemode' => false]);
            }
            if (str_contains($url, 'userinfo')) {
                return Http::response(['sub' => 'external-a', 'email' => 'person@example.test']);
            }
            if (str_contains($url, 'graph.microsoft.com/v1.0/me?')) {
                return Http::response(['id' => 'external-a', 'mail' => 'person@example.test']);
            }
            if ($url === 'https://api.github.com/user') {
                return Http::response(['id' => 123, 'login' => 'developer']);
            }
            if (str_contains($url, 'graphql')) {
                return Http::response(['data' => str_contains($request['query'], 'shop{')
                    ? ['shop' => ['id' => 'gid://shopify/Shop/123', 'name' => 'My shop']]
                    : ['products' => ['nodes' => []], 'orders' => ['nodes' => []]]]);
            }
            if (str_contains($url, 'payment_intents')) {
                return Http::response(['data' => [['id' => 'pi_fixture', 'amount' => 1250,
                    'currency' => 'gbp', 'client_secret' => 'must-never-reach-agent', 'metadata' => ['private' => 'hidden']]]]);
            }
            if (str_contains($url, 'api.github.com/user/repos')) {
                return Http::response([]);
            }

            return Http::response(['items' => [], 'files' => [], 'messages' => [], 'value' => []]);
        });
    }

    private function start(string $service): array
    {
        $start = $this->rpc(['operation' => 'start', 'service' => $service, 'shop' => 'my-shop.myshopify.com'])->assertOk()->json();
        parse_str(parse_url($start['authUrl'], PHP_URL_QUERY), $query);

        return [$start['attemptId'], $query];
    }

    private function complete(string $service, array $query): void
    {
        $query = ['state' => $query['state'], 'code' => 'one-time-code'];
        if ($service === 'shopify') {
            $query += ['shop' => 'my-shop.myshopify.com', 'timestamp' => (string) now()->timestamp];
            ksort($query);
            $query['hmac'] = hash_hmac('sha256', http_build_query($query), 'fixture-secret');
        }
        $this->get('/api/integrations/callback/'.$service.'?'.http_build_query($query))->assertOk();
    }

    private function connect(string $service): string
    {
        $this->fakeProvider($service);
        [$id, $query] = $this->start($service);
        $this->complete($service, $query);

        return $this->rpc(['operation' => 'poll', 'id' => $id])->assertOk()->assertJsonPath('status', 'complete')->json('connectionId');
    }
}
