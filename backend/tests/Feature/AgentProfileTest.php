<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Vibes\Catalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgentProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_provider_preferences_persist_and_invalid_providers_are_rejected(): void
    {
        config(['agents.enabled' => true]);
        $user = User::factory()->create();
        app(\App\Services\Vibes\Wallet::class)->ensure($user);
        $body = ['id' => (string) Str::uuid(), 'name' => 'Reviewer', 'brief' => 'Review changes',
            'avatar' => 'review', 'budget' => 10, 'integrations' => [], 'model' => 'provider:anthropic'];
        $saved = app(\App\Services\Agents\Teammates::class)->save($user->id, $body);
        $this->assertSame('provider:anthropic', $saved['model']);
        $this->assertSame($saved['id'], app(\App\Services\Agents\Teammates::class)->save($user->id, $body)['id']);
        $body['id'] = (string) Str::uuid(); $body['model'] = 'provider:unknown';
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        app(\App\Services\Agents\Teammates::class)->save($user->id, $body);
    }

    public function test_profile_saves_model_and_owned_skills_atomically_and_survives_retries(): void
    {
        config(['agents.enabled' => true]);
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'profile-test'), 'device_name' => 'Profile test']);
        $this->withToken('profile-test');
        $skill = (string) Str::uuid();
        DB::table('agent_skills')->insert(['id' => $skill, 'user_id' => $user->id, 'name' => 'Review', 'instructions' => 'Explain risks.', 'created_at' => now(), 'updated_at' => now()]);
        $this->mock(Catalog::class)->shouldReceive('resolve')->once()->with('test/model', 'free')->andReturn(['id' => 'test/model']);
        $body = ['id' => (string) Str::uuid(), 'name' => 'Reviewer', 'brief' => 'Review changes', 'memory' => 'Be concise',
            'avatar' => 'review', 'budget' => 10, 'integrations' => [], 'model' => 'test/model', 'skillIds' => [$skill]];
        $first = $this->postJson('/api/agents/v1/teammates', $body)->assertOk()->assertJsonPath('teammate.model', 'test/model')->assertJsonPath('teammate.skillIds', [$skill])->json('teammate');
        $this->postJson('/api/agents/v1/teammates', $body)->assertOk()->assertJsonPath('teammate.revision', 1);
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('teammates.0.memory', 'Be concise');
        unset($body['id']); $body['revision'] = 1; $body['model'] = 'auto'; $body['skillIds'] = []; $body['memory'] = 'Cite sources';
        $path = '/api/agents/v1/teammates/'.$first['id'];
        $this->postJson($path, $body)->assertOk()->assertJsonPath('teammate.revision', 2)->assertJsonPath('teammate.skillIds', []);
        $this->postJson($path, $body)->assertOk()->assertJsonPath('teammate.revision', 2);
        $body['skillIds'] = [(string) Str::uuid()]; $body['revision'] = 2;
        $this->postJson($path, $body)->assertUnprocessable();
        $this->assertDatabaseHas('agent_teammates', ['id' => $first['id'], 'revision' => 2, 'model' => 'auto', 'memory' => 'Cite sources']);
        $this->assertDatabaseCount('agent_skill_assignments', 0);
        $this->assertDatabaseHas('agent_skills', ['id' => $skill, 'revision' => 3]);
        $this->assertDatabaseCount('agent_teammates', 1);
    }
}
