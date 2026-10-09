<?php
namespace Tests\Feature;
use App\Models\AgentV2\Run;
use App\Services\AgentCoordination\{Groups, Planning};
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;
final class AgentJobsMembershipTest extends AgentJobsTestCase
{
    protected function setUp(): void
    {
        parent::setUp(); config(['vibes.plan_limits_enabled' => true]);
        $this->user->forceFill(['plan' => 'pro', 'membership_ends_at' => now()->addDay()])->save();
    }
    private function downgrade(): void
    {
        DB::table('membership_periods')->where('user_id', $this->user->id)->update(['revoked_at' => now()]);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['paid_until' => null]);
        $this->user->forceFill(['plan' => 'free', 'membership_ends_at' => null])->save();
        $this->assertFalse(\App\Services\AgentRuns\Jobs\Membership::allows($this->user->id));
    }
    public function test_downgrade_skips_independent_claim_without_starving_legacy_ordered_and_keeps_history_cancel(): void
    {
        $queued = $this->job('queued'); $ordinary = $this->job('ordinary', 'ordered'); $this->downgrade();
        $this->assertSame($ordinary['id'], $this->slot(0)['id']);
        $this->getJson('/api/agents/v2/runs/'.$queued['id'])->assertOk()->assertJsonPath('run.job.queueReason', 'membership_required');
        $this->postJson('/api/agents/v2/runs/'.$queued['id'].'/cancel')->assertOk()->assertJsonPath('run.state', 'cancelled');
    }
    public function test_downgrade_blocks_active_tools_and_server_dispatch_but_keeps_factual_lease_reads(): void
    {
        $connection = $this->gmailInstall('owner@example.com'); $this->grant($connection, ['gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]); $this->job('running'); $run = $this->slot(0);
        $args = ['to' => 'qa@example.com', 'subject' => 'Synthetic', 'body' => 'No real email'];
        $action = $this->callTool($run, 'gmail_send', $connection, $args, 'before')->assertOk()->json('action');
        $this->downgrade();
        $this->callTool($run, 'gmail_send', $connection, $args, 'after')->assertStatus(402)->assertJsonPath('code', 'membership_required');
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['decision' => 'allow', 'fingerprint' => $this->fingerprintOf($action)])
            ->assertStatus(402)->assertJsonPath('code', 'membership_required');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $run['generation']], $this->runnerHeaders())->assertOk();
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk(); Http::assertNothingSent();
    }
    public function test_disabled_parallel_mode_prevents_prepared_provider_write_dispatch(): void
    {
        $connection = $this->gmailInstall('owner@example.com'); $this->grant($connection, ['gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]); $this->job('prepared'); $run = $this->slot(0);
        $action = $this->callTool($run, 'gmail_send', $connection, ['to' => 'qa@example.com', 'subject' => 'Synthetic', 'body' => 'No send'], 'before')->assertOk()->json('action');
        config(['agents_v2.parallel_jobs_enabled' => false]);
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['decision' => 'allow', 'fingerprint' => $this->fingerprintOf($action)])
            ->assertStatus(409)->assertJsonPath('code', 'job_mode_disabled');
        Http::assertNothingSent();
    }
    public function test_planning_run_cannot_claim_or_emit_new_effect_after_downgrade(): void
    {
        $other = app(Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => 'Research',
            'brief' => 'Research', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        $group = app(Groups::class)->save($this->user->id, (string) Str::uuid(), ['expectedRevision' => 0, 'name' => 'Team',
            'coordinatorId' => $this->agent['id'], 'members' => [['agentId' => $this->agent['id'], 'handle' => 'lead'], ['agentId' => $other['id'], 'handle' => 'research']]]);
        $sent = app(Planning::class)->send($this->user->id, $group['id'], ['expectedRevision' => 1, 'expectedRuntimeRevision' => $this->runtime['revision'],
            'runtimeId' => $this->runtime['id'], 'idempotencyKey' => 'group', 'prompt' => 'Plan only', 'mentions' => [], 'sharedContext' => ['text' => '', 'outputs' => []]]);
        $run = $this->slot(0); $this->downgrade();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/events'), ['generation' => $run['generation'], 'events' => [['type' => 'status', 'text' => 'No new work']]],
            $this->runnerHeaders())->assertStatus(402);
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => $run['generation']], $this->runnerHeaders())->assertOk();
        Run::whereKey($run['id'])->update(['state' => 'queued', 'lease_expires_at' => null]);
        $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertNoContent();
        $this->getJson('/api/agents/v2/groups/'.$group['id'].'/messages')->assertOk()->assertJsonPath('messages.0.id', $sent['message']['id']);
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk();
    }
}
