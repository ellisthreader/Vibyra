<?php
namespace Tests\Feature;
use App\Models\AgentV2\RuntimeBinding;
use Illuminate\Support\Facades\DB;
final class AgentJobsFlagFencesTest extends AgentJobsTestCase
{
    public function test_disabling_flags_prevents_old_independent_queue_from_claiming_without_modern_slot(): void
    {
        $this->job('queued'); config(['agents_v2.parallel_jobs_enabled' => false, 'agents_v2.coordination_enabled' => false]);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertNoContent();
        $this->assertDatabaseMissing('agent_runs', ['state' => 'starting']);
    }
    public function test_disabled_mode_stops_new_effects_but_retains_receipt_read_generation_and_slot_fences(): void
    {
        $this->job('active'); $run = $this->slot(0);
        config(['agents_v2.parallel_jobs_enabled' => false, 'agents_v2.coordination_enabled' => false]);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/events'), ['generation' => $run['generation'],
            'events' => [['type' => 'status', 'text' => 'Still writing']]], $this->runnerHeaders())->assertStatus(409)->assertJsonPath('code', 'job_mode_disabled');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $run['generation']], $this->runnerHeaders())->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $run['generation'] + 1], $this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        DB::table('agent_runtime_slots')->where('binding_id', $this->runtime['id'])->delete();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $run['generation']], $this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code', 'stale_job_slot');
    }
    public function test_ordered_tasks_do_not_wait_for_older_independent_contexts_but_still_serialize_ordered_turns(): void
    {
        $independent = $this->job('independent'); $ordered = $this->job('ordered', 'ordered'); $later = $this->job('later', 'ordered');
        $first = $this->slot(0); $second = $this->slot(1);
        $this->assertSame($independent['id'], $first['id']); $this->assertSame($ordered['id'], $second['id']);
        $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 2], $this->runnerHeaders())->assertNoContent();
        $this->getJson('/api/agents/v2/runs/'.$later['id'])->assertOk()->assertJsonPath('run.job.queueReason', 'earlier_turn');
        $this->finish($second); $this->assertSame($later['id'], $this->slot(1)['id']);
    }
    public function test_disabling_rollout_does_not_release_an_unknown_write_to_a_new_ordered_job(): void
    {
        $connection = $this->gmailInstall('owner@example.com'); $this->grant($connection, ['gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]); $this->job('write-before'); $run = $this->slot(0);
        $body = ['to' => 'qa@example.com', 'subject' => 'Synthetic test', 'body' => 'No real email.'];
        $first = $this->callTool($run, 'gmail_send', $connection, $body, 'send-before')->assertOk()->json('action');
        $this->postJson('/api/agents/v2/actions/'.$first['id'].'/decision', ['fingerprint' => $this->fingerprintOf($first), 'decision' => 'allow'])->assertOk();
        \App\Models\AgentV2\ToolAction::whereKey($first['id'])->update(['state' => 'unknown']);
        config(['agents_v2.parallel_jobs_enabled' => false, 'agents_v2.coordination_enabled' => false]);
        $this->assertTrue(\App\Services\AgentRuns\Jobs\AccountLock::enabled($this->user->id));
        $this->job('write-after', 'ordered'); $later = $this->slot(1);
        $second = $this->callTool($later, 'gmail_send', $connection, $body, 'send-after')->assertOk()->json('action');
        $this->postJson('/api/agents/v2/actions/'.$second['id'].'/decision', ['fingerprint' => $this->fingerprintOf($second), 'decision' => 'allow'])
            ->assertOk()->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'resource_busy');
        \Illuminate\Support\Facades\Http::assertSentCount(1);
    }

}
