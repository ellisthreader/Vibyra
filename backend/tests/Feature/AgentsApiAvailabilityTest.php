<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgentsApiAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_routes_require_authentication_instead_of_falling_through_to_options(): void
    {
        $this->getJson('/api/agents/v1/teammates')->assertUnauthorized();
        $this->getJson('/api/agents/v1/skills')->assertUnauthorized();
    }

    public function test_authenticated_clients_share_a_dedicated_chat_and_retries_do_not_duplicate_it(): void
    {
        config(['agents.enabled' => true, 'vibes.enabled' => true]);
        $user = User::factory()->create(['email_verified_at' => now()]);
        $this->signIn($user, 'mac-test-token');
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('teammates', []);
        $body = ['id' => (string) Str::uuid(), 'name' => 'Reviewer', 'brief' => 'Review code',
            'memory' => '', 'avatar' => 'review', 'budget' => 10, 'integrations' => []];
        $first = $this->postJson('/api/agents/v1/teammates', $body)->assertOk()->json('teammate');
        $this->postJson('/api/agents/v1/teammates', $body)->assertOk()
            ->assertJsonPath('teammate.chatId', $first['chatId']);
        $this->assertDatabaseCount('agent_teammates', 1);
        $this->signIn($user, 'phone-test-token');
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('teammates.0.id', $body['id']);
        $this->getJson('/api/agents/v1/teammates/'.$body['id'].'/chats')->assertOk()
            ->assertJsonPath('chats.0.id', $first['chatId']);
        $this->getJson('/api/vibes/chats')->assertOk()->assertJsonPath('chats', []);
        config(['agents.enabled' => false]);
        $this->getJson('/api/agents/v1/teammates')->assertOk()
            ->assertJsonPath('enabled', false)->assertJsonPath('teammates.0.id', $body['id']);
        $this->signIn(User::factory()->create(), 'other-account-token');
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('teammates', []);
        $this->getJson('/api/agents/v1/teammates/'.$body['id'].'/chats')->assertNotFound();
    }

    private function signIn(User $user, string $token): void
    {
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'Agent API test']);
        $this->withToken($token);
    }
}
