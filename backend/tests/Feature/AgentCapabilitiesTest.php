<?php
namespace Tests\Feature;
use App\Models\AgentV2\{Connection, Run};
use App\Services\AgentCapabilities\{Authority, Catalogue};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;
class AgentCapabilitiesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;
    protected function setUp(): void
    {
        parent::setUp(); $this->bootV2();
        $this->user->forceFill(['plan' => 'pro', 'membership_ends_at' => now()->addDay()])->save();
        config(['agents_v2.capabilities_enabled' => true, 'vibes.plan_limits_enabled' => true]);
    }
    private function connection(): Connection
    {
        return Connection::create(['user_id' => $this->user->id, 'provider' => 'github', 'external_identity' => 'test-owner',
            'generation' => 1, 'health' => 'healthy', 'capability_revision' => 1]);
    }
    private function review(Connection $c, int $revision = 0): array
    {
        $row = app(Catalogue::class)->get('github', $c);
        return ['connectionId' => $c->id, 'expectedConnectionGeneration' => $c->generation,
            'expectedRevision' => $revision, 'version' => $row['version'], 'reviewHash' => $row['reviewHash']];
    }
    public function test_install_reviews_exact_tools_without_creating_grants_and_retry_is_idempotent(): void
    {
        $c = $this->connection(); $data = $this->review($c);
        $first = $this->putJson('/api/agents/v2/capabilities/github/install', $data)->assertOk()->json('installation');
        $this->assertSame('installed', $first['status']); $this->assertSame(1, $first['revision']);
        $this->assertDatabaseCount('agent_grants', 0);
        $this->putJson('/api/agents/v2/capabilities/github/install', $data)->assertOk()->assertJsonPath('installation.id', $first['id'])
            ->assertJsonPath('installation.revision', 1);
        $this->getJson('/api/agents/v2/capabilities')->assertOk()->assertJsonStructure(['triggerKinds', 'routines', 'capabilities', 'installations']);
        $this->putJson('/api/agents/v2/capabilities/github/install', [...$data, 'reviewHash' => str_repeat('a', 64)])->assertStatus(409);
    }
    public function test_management_blocks_implicit_adoption_and_removal_is_a_persistent_tombstone(): void
    {
        $c = $this->connection(); $this->putJson('/api/agents/v2/capabilities/github/install', $this->review($c))->assertOk();
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['integrations' => '["github"]']);
        $this->admit('Read GitHub issues.'); $this->assertDatabaseCount('agent_grants', 0);
        $this->grant($c->id, ['github_read_issue']);
        $this->deleteJson('/api/agents/v2/capabilities/github/install', ['connectionId' => $c->id, 'expectedRevision' => 1])
            ->assertOk()->assertJsonPath('installation.status', 'revoked')->assertJsonPath('installation.revision', 2);
        $this->admit('Read GitHub issues.');
        $this->assertSame(0, DB::table('agent_grants')->whereNull('revoked_at')->count());
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$c->id, ['operations' => ['github_read_issue']])->assertStatus(409);
        $this->putJson('/api/agents/v2/capabilities/github/install', $this->review($c))->assertStatus(409);
        $this->assertNull($c->fresh()->revoked_at, 'Removing a capability preserves the separate account connection.');
    }
    public function test_old_runs_cannot_cross_install_update_reconnect_or_revocation(): void
    {
        $c = $this->connection(); $this->grant($c->id, ['github_read_issue']);
        $before = Run::findOrFail($this->admit('Read GitHub issues.')['id']);
        $this->putJson('/api/agents/v2/capabilities/github/install', $this->review($c))->assertOk();
        $this->assertFalse(Authority::allows($before, $c));
        $after = Run::findOrFail($this->admit('Read GitHub issues.')['id']); $this->assertTrue(Authority::allows($after, $c));
        $c->forceFill(['generation' => 2])->save(); $this->assertFalse(Authority::allows($after, $c));
        $this->getJson('/api/agents/v2/capabilities/github?connectionId='.$c->id)->assertOk()->assertJsonPath('installations.0.status', 'needs_review');
        $this->putJson('/api/agents/v2/capabilities/github/install', $this->review($c, 1))->assertOk();
        $this->assertFalse(Authority::allows($after, $c));
    }
    public function test_account_ownership_provider_and_free_plan_are_enforced(): void
    {
        $c = $this->connection(); $data = $this->review($c);
        $this->putJson('/api/agents/v2/capabilities/gmail/install', $data)->assertStatus(409);
        $c->forceFill(['user_id' => \App\Models\User::factory()->create()->id])->save();
        $this->putJson('/api/agents/v2/capabilities/github/install', $data)->assertNotFound();
        $this->user->forceFill(['plan' => 'free', 'membership_ends_at' => null])->save();
        $this->putJson('/api/agents/v2/capabilities/github/install', $data)->assertStatus(402);
    }
}
