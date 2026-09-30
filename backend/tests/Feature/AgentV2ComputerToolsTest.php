<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Mac computer tools on the V2 engine: grant mapping, flags, claim/receipt fencing (fixtures only). */
class AgentV2ComputerToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2ComputerFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function freshRun(): array
    {
        foreach (DB::table('agent_runs')->whereNotIn('state', ['completed', 'failed', 'cancelled', 'outcome_unknown'])->pluck('id') as $open)
            $this->postJson('/api/agents/v2/runs/'.$open.'/cancel')->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        return $this->admit('Fix the notes file.');
    }

    public function test_tools_need_the_mac_grant_the_flags_and_the_mac_that_holds_the_folder(): void
    {
        $this->bootComputer(false);
        $this->assertNull($this->computerConnection(), 'Flags off: no computer connection is created.');
        $run = $this->admit('Look at my repo.');
        $this->assertSame([], $this->toolNames($run['id']));
        $this->computerFlags(true);
        $conn = $this->computerConnection();
        $this->assertNotNull($conn);
        $this->assertSame([], $this->toolNames($run['id']), 'The run keeps its admission grant snapshot.');
        $run = $this->freshRun();
        $tools = $this->toolNames($run['id']);
        sort($tools);
        $this->assertSame(['open_draft_pr', 'publish_branch', 'run_test', 'workspace_changes', 'workspace_edit',
            'workspace_list', 'workspace_read', 'workspace_search'], $tools);
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$conn, ['operations' => ['workspace_read']])
            ->assertStatus(409)->assertJsonPath('code', 'computer_grant_local');
        config(['agents.github_pr_enabled' => false, 'agents.vm_tests_enabled' => false]);
        $this->assertNotContains('run_test', $this->toolNames($run['id']));
        $this->assertNotContains('open_draft_pr', $this->toolNames($run['id']));
        $this->computerFlags(false);
        $this->assertSame([], $this->toolNames($run['id']), 'Flags off: absent from the live manifest.');
        $this->computerFlags(true);
        // Another Mac (or an app without computer support) is never offered this folder.
        DB::table('agent_workspaces')->where('id', $this->workspaceId)->update(['host_id' => str_repeat('c', 64)]);
        $this->assertSame([], $this->toolNames($run['id']));
    }

    public function test_a_runtime_without_computer_support_gets_no_computer_tools(): void
    {
        $this->bootComputer(true, false);
        $run = $this->admit('Look at my repo.');
        $this->assertNotNull($this->computerConnection());
        $this->assertSame([], $this->toolNames($run['id']));
    }

    public function test_a_read_is_claimed_and_answered_by_the_leased_mac_and_a_duplicate_receipt_is_a_no_op(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $this->admit('Read notes.');
        $claimed = $this->claim();
        $read = $this->callTool($claimed, 'workspace_read', $conn, ['path' => 'notes.txt'], 'r1')->assertOk()
            ->assertJsonPath('action.state', 'approved')->json('action');
        $this->assertSame('waiting_for_tool', $this->runState($claimed['id']));
        $this->callTool($claimed, 'workspace_read', $conn, ['path' => '../secret'], 'r0')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'invalid_arguments');
        $listed = $this->macList($claimed)->assertOk()->assertJsonPath('actions.0.id', $read['id'])
            ->assertJsonPath('actions.0.workspaceId', $this->workspaceId)->assertJsonPath('actions.0.arguments.path', 'notes.txt')
            ->json('actions.0');
        $this->macReceipt($claimed, $read['id'], ['content' => 'x'])->assertStatus(409)->assertJsonPath('code', 'not_claimed');
        $this->macClaim($claimed, $listed)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $receipt = ['content' => "hello\n", 'sha256' => hash('sha256', "hello\n")];
        $this->macReceipt($claimed, $read['id'], $receipt)->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.result.content', "hello\n")->assertJsonPath('action.receipt.status', 'confirmed');
        $this->assertSame('running', $this->runState($claimed['id']));
        $events = DB::table('agent_run_events')->where('run_id', $claimed['id'])->where('type', 'tool.result')->count();
        $this->macReceipt($claimed, $read['id'], $receipt)->assertOk()->assertJsonPath('action.state', 'completed');
        $this->assertSame($events, DB::table('agent_run_events')->where('run_id', $claimed['id'])->where('type', 'tool.result')->count());
        $this->macReceipt($claimed, $read['id'], ['content' => 'other', 'sha256' => hash('sha256', 'other')])
            ->assertStatus(409)->assertJsonPath('code', 'receipt_conflict');
        $this->macList($claimed)->assertOk()->assertJsonCount(0, 'actions');
    }

    public function test_an_edit_waits_for_exact_approval_and_its_receipt_must_match(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $this->admit('Fix notes.');
        $claimed = $this->claim();
        $args = ['path' => 'notes.txt', 'content' => "fixed\n", 'expectedSha256' => 'new'];
        $edit = $this->callTool($claimed, 'workspace_edit', $conn, $args, 'w1')->assertOk()
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->macList($claimed)->assertOk()->assertJsonCount(0, 'actions');
        $this->macClaim($claimed, $edit)->assertStatus(409)->assertJsonPath('code', 'not_approved');
        $this->decide($edit)->assertOk()->assertJsonPath('action.state', 'approved');
        $this->macClaim($claimed, ['id' => $edit['id'], 'fingerprint' => str_repeat('0', 64)])
            ->assertStatus(409)->assertJsonPath('code', 'stale_fingerprint');
        $this->macClaim($claimed, $edit)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $this->macReceipt($claimed, $edit['id'], ['written' => true, 'path' => 'notes.txt', 'sha256' => hash('sha256', 'other')])
            ->assertStatus(422);
        $digest = str_repeat('d', 64);
        $this->macReceipt($claimed, $edit['id'], ['written' => true, 'path' => 'notes.txt', 'sha256' => hash('sha256', "fixed\n"),
            'snapshotSha256' => $digest])->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.result.snapshotSha256', $digest)
            ->assertJsonPath('action.receipt.providerResourceId', hash('sha256', "fixed\n"));
    }

    public function test_a_stale_generation_is_fenced_and_a_write_from_a_lost_lease_becomes_unknown(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $this->admit('Fix notes.');
        $first = $this->claim();
        $read = $this->callTool($first, 'workspace_read', $conn, ['path' => 'notes.txt'], 'r1')->json('action');
        $this->macClaim($first, $read)->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        $second = $this->claim();
        $this->assertSame($first['generation'] + 1, $second['generation']);
        $receipt = ['content' => "a\n", 'sha256' => hash('sha256', "a\n")];
        $this->macReceipt($first, $read['id'], $receipt)->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->macList($first)->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->macReceipt($second, $read['id'], $receipt)->assertStatus(409)->assertJsonPath('code', 'not_claimed');
        $this->macClaim($second, $read)->assertOk()->assertJsonPath('action.claimedGeneration', $second['generation']);
        $this->macReceipt($second, $read['id'], $receipt)->assertOk()->assertJsonPath('action.state', 'completed');
        $edit = $this->callTool($second, 'workspace_edit', $conn, ['path' => 'notes.txt', 'content' => "b\n",
            'expectedSha256' => hash('sha256', "a\n")], 'w1')->json('action');
        $this->decide($edit)->assertOk();
        $this->macClaim($second, $edit)->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        $third = $this->claim();
        $this->macClaim($third, $edit)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->macReceipt($second, $edit['id'], ['written' => true])->assertStatus(409)->assertJsonPath('code', 'stale_lease');
    }

    public function test_revoking_the_v2_grant_ends_the_mac_grant_and_refuses_an_approved_action(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $this->admit('Fix notes.');
        $claimed = $this->claim();
        $edit = $this->callTool($claimed, 'workspace_edit', $conn, ['path' => 'a.txt', 'content' => 'x', 'expectedSha256' => 'new'], 'w1')->json('action');
        $this->decide($edit)->assertOk()->assertJsonPath('action.state', 'approved');
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$conn)->assertOk();
        $this->assertNull($this->computerConnection());
        $this->assertNotNull(DB::table('agent_workspaces')->where('id', $this->workspaceId)->value('revoked_at'));
        $this->macClaim($claimed, $edit)->assertOk()->assertJsonPath('action.state', 'refused');
    }
}
