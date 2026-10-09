<?php
namespace Tests\Feature;
use App\Models\AgentV2\RuntimeBinding;
use Illuminate\Support\Facades\Http;
final class AgentJobsLateReceiptTest extends AgentJobsTestCase
{
    use \Tests\Support\AgentV2ComputerFixture;
    public function test_already_claimed_computer_write_receipt_survives_cancellation_and_slot_reuse_without_new_dispatch(): void
    {
        $this->bootComputer(); $this->coordinationRuntime();
        $binding = RuntimeBinding::find($this->runtime['id']);
        $binding->forceFill(['capabilities' => [...$binding->capabilities, 'computerTools' => true]])->save();
        $connection = $this->computerConnection(); $this->assertNotNull($connection);
        $this->job('local-edit'); $run = $this->slot(0);
        $action = $this->callTool($run, 'workspace_edit', $connection, ['path' => 'notes.txt', 'content' => "fixed\n", 'expectedSha256' => 'new'], 'edit')
            ->assertOk()->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['decision' => 'allow', 'fingerprint' => $this->fingerprintOf($action)])
            ->assertOk()->assertJsonPath('action.state', 'approved');
        $this->macClaim($run, $action)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk();
        $this->job('replacement'); $replacement = $this->slot(0); $this->assertNotSame($run['id'], $replacement['id']);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $run['generation']], $this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code', 'stale_job_slot');
        config(['vibes.plan_limits_enabled' => true]);
        \Illuminate\Support\Facades\DB::table('membership_periods')->where('user_id', $this->user->id)->update(['revoked_at' => now()]);
        $this->assertFalse(\App\Services\AgentRuns\Jobs\Membership::allows($this->user->id));
        $result = ['written' => true, 'path' => 'notes.txt', 'sha256' => hash('sha256', "fixed\n")];
        $this->macReceipt($run, $action['id'], $result)->assertOk()->assertJsonPath('action.state', 'completed');
        $this->macReceipt($run, $action['id'], $result)->assertOk()->assertJsonPath('action.state', 'completed');
        $this->macReceipt($run, $action['id'], $result, $run['generation'] + 1)->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->macClaim($run, $action)->assertStatus(402)->assertJsonPath('code', 'membership_required'); $this->assertDatabaseHas('agent_runs', ['id' => $run['id'], 'state' => 'cancelled']);
        Http::assertNothingSent();
    }
}
