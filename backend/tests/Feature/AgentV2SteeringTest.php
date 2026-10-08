<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\{RunStates, Runs, Steering};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2SteeringTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void {
        parent::setUp(); $this->bootV2();
        \App\Models\AgentV2\RuntimeBinding::whereKey($this->runtime['id'])->update(['capabilities' => json_encode(['controlledTools' => true, 'taskSteering' => true])]);
    }

    private function steer(array $run, string $text = 'Only include Friday.', int $revision = 0, ?string $key = null)
    {
        return $this->postJson('/api/agents/v2/runs/'.$run['id'].'/instructions',
            ['idempotencyKey' => $key ?? (string) Str::uuid(), 'expectedRevision' => $revision, 'text' => $text]);
    }

    private function checkpoint(array $run, int $generation = 1)
    {
        return $this->postJson($this->runnerPath('/runs/'.$run['id'].'/checkpoint'), ['generation' => $generation], $this->runnerHeaders());
    }

    public function test_lost_submit_reply_is_idempotent_and_original_request_never_changes(): void
    {
        $run = $this->admit('Original request'); $key = (string) Str::uuid();
        $this->steer($run, 'Correction', 0, $key)->assertOk()->assertJsonPath('run.instructionRevision', 1)
            ->assertJsonPath('run.prompt', 'Original request')->assertJsonPath('run.appliedInstructionRevision', 0);
        $this->steer($run, 'Correction', 0, $key)->assertOk()->assertJsonCount(1, 'run.instructions');
        $this->steer($run, 'Different', 0, $key)->assertStatus(409)->assertJsonPath('code', 'instruction_conflict');
        $this->steer($run, 'Stale', 0)->assertStatus(409)->assertJsonPath('code', 'instruction_changed');
        $this->assertSame(1, DB::table('agent_run_instructions')->count());
        $claimed = $this->claim();
        $this->assertSame($run['id'], $claimed['id']);
        $this->assertSame(1, $claimed['appliedInstructionRevision']);
    }

    public function test_running_attempt_is_fenced_then_checkpoint_continues_same_run(): void
    {
        $run = $this->admit(); $first = $this->claim();
        $this->steer($run)->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => 1, 'answer' => 'Old answer'], $this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code', 'instruction_pending');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => 1], $this->runnerHeaders())
            ->assertOk()->assertJsonPath('steeringRequested', true);
        $this->checkpoint($run)->assertOk(); $this->checkpoint($run)->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/heartbeat'), ['generation' => 1], $this->runnerHeaders())
            ->assertOk()->assertJsonPath('leaseExpiresAt', null);
        $next = $this->claim();
        $this->assertSame($first['id'], $next['id']); $this->assertSame(2, $next['generation']);
        $this->assertSame(1, $next['appliedInstructionRevision']);
        $this->assertSame('Only include Friday.', $next['instructions'][0]['text']);
        $this->checkpoint($run)->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => 2, 'answer' => 'Friday only'], $this->runnerHeaders())
            ->assertOk()->assertJsonPath('run.state', 'completed');
        $this->assertSame(1, DB::table('agent_run_events')->where('type', 'instruction.checkpoint')->count());
    }

    public function test_pending_approval_is_invalidated_and_never_dispatched(): void
    {
        [$run, $claimed, $connection, $action] = $this->pendingWrite();
        $fingerprint = $this->fingerprintOf($action);
        $this->steer($run)->assertOk()->assertJsonPath('run.actions.0.state', 'cancelled');
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['decision' => 'allow', 'fingerprint' => $fingerprint])
            ->assertStatus(409);
        Http::assertNothingSent();
        $this->checkpoint($run)->assertOk();
        $this->assertSame('cancelled', $this->claim()['actionCheckpoint'][0]['state']);
    }

    public function test_in_flight_action_blocks_reclaim_until_receipt_settles_and_is_not_replayed(): void
    {
        [$run, $claimed, $connection, $action] = $this->pendingWrite();
        ToolAction::whereKey($action['id'])->update(['state' => 'dispatching', 'dispatched_at' => now()]);
        $this->steer($run)->assertOk()->assertJsonPath('run.actions.0.state', 'dispatching');
        $this->checkpoint($run)->assertOk();
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        ToolAction::whereKey($action['id'])->update(['state' => 'completed', 'result' => json_encode(['id' => 'sent-1'])]);
        $next = $this->claim();
        $this->assertSame('sent-1', $next['actionCheckpoint'][0]['result']['id']);
        $this->callTool($next, 'gmail_send', $connection, $this->args(), 'repeat-after-steer')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'already_dispatched');
        Http::assertNothingSent();
    }

    public function test_cancellation_wins_and_cross_account_cannot_steer(): void
    {
        $run = $this->admit(); $this->claim();
        $this->steer($run)->assertOk();
        app(Runs::class)->cancel($this->user->id, $run['id']);
        $this->checkpoint($run)->assertStatus(409)->assertJsonPath('code', 'run_finished');
        $this->steer($run, 'Again', 1)->assertStatus(409)->assertJsonPath('code', 'run_finished');
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        app(Steering::class)->submit($this->user->id + 1, $run['id'], ['idempotencyKey' => (string) Str::uuid(), 'expectedRevision' => 1, 'text' => 'No']);
    }

    public function test_reconnect_after_crash_acknowledges_latest_revision_once(): void
    {
        $run = $this->admit(); $this->claim();
        $this->steer($run)->assertOk(); $this->steer($run, 'And keep it short.', 1)->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 1)->seconds();
        $next = $this->claim();
        $this->assertSame(2, $next['instructionRevision']); $this->assertSame(2, $next['appliedInstructionRevision']);
        $this->assertCount(2, $next['instructions']);
        $this->assertSame(1, DB::table('agent_run_events')->where('type', 'instruction.applied')->count());
    }

    public function test_blank_oversized_or_non_uuid_instruction_is_refused(): void
    {
        $run = $this->admit();
        $this->steer($run, '   ')->assertStatus(422);
        $this->steer($run, str_repeat('a', 8001))->assertStatus(422);
        $this->steer($run, 'Okay', 0, 'bad-key')->assertStatus(422);
        $this->assertSame(0, DB::table('agent_run_instructions')->count());
    }

    public function test_old_runner_and_old_run_snapshot_cannot_silently_ignore_corrections(): void
    {
        $run = $this->admit();
        $row = Run::findOrFail($run['id']);
        $snapshot = $row->runtime_snapshot;
        $snapshot['capabilities']['taskSteering'] = false;
        $row->update(['runtime_snapshot' => $snapshot]);
        $this->steer($run)->assertStatus(409)->assertJsonPath('code', 'steering_unsupported');
        $snapshot['capabilities']['taskSteering'] = true;
        $row->update(['runtime_snapshot' => $snapshot]);
        $this->steer($run)->assertOk();
        \App\Models\AgentV2\RuntimeBinding::whereKey($this->runtime['id'])->update(['capabilities' => json_encode(['controlledTools' => true])]);
        $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertNoContent();
        $this->assertSame(0, $row->fresh()->applied_instruction_revision);
    }

    public function test_inflight_receipt_fence_stays_valid_but_new_tools_and_old_output_are_blocked(): void
    {
        [$run, $claimed, $connection] = $this->pendingWrite();
        $this->steer($run)->assertOk();
        $this->callTool($claimed, 'gmail_send', $connection, $this->args(), 'new-call')->assertStatus(409)
            ->assertJsonPath('code', 'instruction_pending');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/events'),
            ['generation' => 1, 'events' => [['type' => 'message.delta', 'text' => 'Old output']]], $this->runnerHeaders())
            ->assertStatus(409)->assertJsonPath('code', 'instruction_pending');
        $binding = \App\Models\AgentV2\RuntimeBinding::findOrFail($this->runtime['id']);
        $receiptRun = DB::transaction(fn () => app(\App\Services\AgentRuns\Leases::class)->fenced($binding, $run['id'], 1, true));
        $this->assertSame($run['id'], $receiptRun->id);
    }

    private function args(): array { return ['to' => 'qa@example.test', 'subject' => 'Test', 'body' => 'Hello']; }

    private function pendingWrite(): array
    {
        $connection = $this->gmailInstall('qa@example.test'); $this->grant($connection, ['gmail_send']);
        $run = $this->admit(); $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $connection, $this->args(), 'send-first')->assertOk()->json('action');
        return [$run, $claimed, $connection, $action];
    }
}
