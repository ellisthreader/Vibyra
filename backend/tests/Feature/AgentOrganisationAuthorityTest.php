<?php
namespace Tests\Feature;
use App\Models\{OrganizationMember, AgentV2\Run};
use App\Services\AgentOrganizations\{Definitions, Instances, Maintenance, Policies};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentOrganisationFixture;
use Tests\TestCase;
final class AgentOrganisationAuthorityTest extends TestCase
{
    use RefreshDatabase, AgentOrganisationFixture;
    protected function setUp(): void { parent::setUp(); $this->bootOrganisation(); }
    private function send(string $key = 'org-send')
    {
        return $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'],
            'idempotencyKey' => $key, 'prompt' => 'Private request']);
    }
    public function test_admission_pins_actor_seat_definition_and_selected_runtime_and_reconnect_is_safe(): void
    {
        $run = $this->send()->assertCreated()->json('run');
        $this->publish(['name' => 'New shared name', 'knowledge' => 'A different launch date']);
        $this->runtime = $this->registerRuntime('acct-1');
        $claimed = $this->claim();
        $this->assertSame($run['id'], $claimed['id']);
        $this->assertSame('Shared researcher', $claimed['profile']['name']);
        $this->assertStringContainsString('Company launch date is Friday.', $claimed['profile']['brief']);
        $this->assertStringNotContainsString('A different launch date', $claimed['profile']['brief']);
        $this->assertSame($this->user->id, $run['organisation']['humanActorId']);
        $this->assertSame($this->runtime['id'], $run['organisation']['runtimeId']);
        $this->assertSame(1, $run['organisation']['definitionRevision']);
        $this->send()->assertOk()->assertJsonPath('run.id', $run['id']);
    }
    public function test_daily_limit_counts_exactly_once_and_owner_policy_has_cas(): void
    {
        $body = ['expectedRevision' => 1, 'enabled' => true, 'allowedProviders' => ['gmail'], 'dailyTaskLimit' => 1, 'retentionDays' => 7];
        $this->putJson('/api/agents/v2/organisation/policy', $body)->assertOk()->assertJsonPath('policy.revision', 2);
        $this->putJson('/api/agents/v2/organisation/policy', $body)->assertOk()->assertJsonPath('policy.revision', 2);
        $this->putJson('/api/agents/v2/organisation/policy', [...$body, 'dailyTaskLimit' => 5])->assertConflict();
        $this->send()->assertCreated(); $this->send()->assertOk();
        $this->send('org-second')->assertStatus(429)->assertJsonPath('code', 'organisation_daily_limit');
        $this->assertSame(1, DB::table('agent_organisation_runs')->count());
        $manager = $this->colleague('admin');
        $this->withToken('org-user-'.$manager->id)->putJson('/api/agents/v2/organisation/policy', [...$body, 'expectedRevision' => 2])->assertForbidden();
    }
    public function test_offboard_rejoin_cannot_revive_old_instance_and_cancels_active_work(): void
    {
        $run = $this->send()->assertCreated()->json('run'); $claimed = $this->claim();
        $seat = OrganizationMember::where('user_id', $this->user->id)->firstOrFail(); $old = $seat->id; $seat->delete();
        OrganizationMember::forceCreate(['organization_id' => $this->org->id, 'user_id' => $this->user->id, 'role' => 'owner']);
        $this->send('after-rejoin')->assertConflict()->assertJsonPath('code', 'organisation_membership_changed');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $claimed['generation']],
            $this->runnerHeaders())->assertConflict()->assertJsonPath('code', 'organisation_membership_changed');
        $this->assertSame(1, Maintenance::stopRevoked());
        $this->assertSame('cancelled', Run::findOrFail($run['id'])->state);
        $new = Instances::adopt($this->user->id, $this->definition['id'], 1, $this->definition['reviewHash']);
        $this->assertNotSame($this->agent['id'], $new['agentId']);
        $this->assertNotSame($old, DB::table('agent_organisation_instances')->where('agent_id', $new['agentId'])->value('member_id'));
        $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk();
    }
    public function test_retirement_blocks_queued_claim_and_stops_old_task_without_rewriting_history(): void
    {
        $run = $this->send()->assertCreated()->json('run');
        Definitions::retire($this->user->id, $this->definition['id'], 1);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->assertSame(1, Maintenance::stopRevoked());
        $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk()->assertJsonPath('run.prompt', 'Private request');
        $this->send('after-retire')->assertConflict();
    }
    public function test_model_change_fences_instead_of_silently_adopting_new_selection(): void
    {
        $this->send()->assertCreated();
        DB::table('agent_runtime_bindings')->where('id', $this->runtime['id'])->update(['model' => 'different-model']);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->assertSame(1, Maintenance::stopRevoked());
    }
    public function test_preview_filters_current_organisation_policy_without_admitting_or_consuming_quota(): void
    {
        $gmail = $this->gmailInstall('owner@example.com'); $this->grant($gmail, ['gmail_send']);
        $body = ['agentId' => $this->agent['id'], 'idempotencyKey' => 'organisation-preview', 'prompt' => 'Email a summary with Gmail.'];
        $this->postJson('/api/agents/v2/runs/preview', $body)->assertOk()->assertJsonPath('plan.services.0.provider', 'gmail');
        Policies::save($this->user->id, ['expectedRevision' => 1, 'enabled' => true, 'allowedProviders' => [], 'dailyTaskLimit' => 1, 'retentionDays' => 7]);
        $this->postJson('/api/agents/v2/runs/preview', $body)->assertOk()->assertJsonPath('plan.services', []);
        $this->assertSame(0, DB::table('agent_organisation_runs')->count());
        $this->assertSame(0, Run::count());
    }
}
