<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConnectorThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true,
            'chat_connectors.catalogue.github.oauth.client_id' => 'fixture',
            'chat_connectors.catalogue.github.oauth.client_secret' => 'fixture']);
        $user = User::factory()->create(['guest_at' => now(), 'provider' => 'guest']);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'guest'), 'device_name' => 'iPhone']);
        $this->withToken('guest');
    }

    public function test_browsing_and_polling_do_not_consume_connection_attempts(): void
    {
        for ($i = 0; $i < 15; $i++) $this->getJson('/api/connectors')->assertOk();
        $flow = $this->postJson('/api/connectors/github/start')->assertOk()->json('flowId');
        for ($i = 0; $i < 8; $i++) $this->getJson('/api/connectors/flows/'.$flow)->assertOk();
        $this->postJson('/api/connectors/github/start')->assertOk();
    }

    public function test_connection_attempts_count_once_and_still_enforce_the_limit(): void
    {
        for ($i = 0; $i < 10; $i++) $this->postJson('/api/connectors/github/start')->assertOk();
        $this->postJson('/api/connectors/github/start')->assertStatus(429);
        $this->getJson('/api/connectors')->assertOk();
    }
}
