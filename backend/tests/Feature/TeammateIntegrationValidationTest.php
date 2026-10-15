<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Illuminate\Support\Str;
use Tests\TestCase;

class TeammateIntegrationValidationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['agents.enabled' => true, 'vibes.enabled' => true]);
        Http::preventStrayRequests();
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'qa-teammate-fixture'), 'device_name' => 'QA fixture']);
        $this->withToken('qa-teammate-fixture');
    }

    private function body(array $integrations): array
    {
        return ['id' => (string) Str::uuid(), 'name' => 'QA teammate', 'brief' => 'QA only. Reply OK. No tools.',
            'memory' => '', 'avatar' => 'assistant', 'budget' => 5, 'model' => 'auto', 'skillIds' => [], 'integrations' => $integrations];
    }

    private function installGithub(): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => 'github',
            'credential' => Crypt::encryptString('fixture-never-disclosed'), 'account_label' => 'private fixture label',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_fresh_teammate_with_no_tools_succeeds(): void
    {
        $this->postJson('/api/agents/v1/teammates', $this->body([]))->assertOk()->assertJsonPath('teammate.integrations', []);
        $this->assertDatabaseCount('agent_teammates', 1);
        Http::assertNothingSent();
    }

    public function test_mixed_selections_name_only_unavailable_tools_without_creating_anything(): void
    {
        $this->installGithub();
        $response = $this->postJson('/api/agents/v1/teammates', $this->body(['github', 'stripe', 'figma']))->assertStatus(422);
        $this->assertSame('Connect each selected tool before giving it to your teammate. Connect or remove: Stripe (stripe), Figma (figma).', $response->json('message'));
        foreach (['github', 'fixture-never-disclosed', 'private fixture label'] as $private) $this->assertStringNotContainsString($private, $response->getContent());
        $this->assertDatabaseCount('agent_teammates', 0);
        $this->assertDatabaseCount('vibes_chats', 0);
        Http::assertNothingSent();
    }

    public function test_removing_the_unavailable_selection_allows_the_same_request_once(): void
    {
        $this->installGithub();
        $body = $this->body(['github', 'stripe']);
        $this->postJson('/api/agents/v1/teammates', $body)->assertStatus(422);
        $body['integrations'] = ['github'];
        $this->postJson('/api/agents/v1/teammates', $body)->assertOk()->assertJsonPath('teammate.id', $body['id'])->assertJsonPath('teammate.integrations', ['github']);
        $this->postJson('/api/agents/v1/teammates', $body)->assertOk()->assertJsonPath('teammate.id', $body['id']);
        $this->assertDatabaseCount('agent_teammates', 1);
        $this->assertDatabaseCount('vibes_chats', 1);
        Http::assertNothingSent();
    }

    public function test_unknown_ids_are_still_rejected_before_service_validation(): void
    {
        $response = $this->postJson('/api/agents/v1/teammates', $this->body(['private-unknown-value']))->assertStatus(422);
        $this->assertStringNotContainsString('private-unknown-value', $response->getContent());
        $this->assertDatabaseCount('agent_teammates', 0);
    }
}
