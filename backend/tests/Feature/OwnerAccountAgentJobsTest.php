<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\StrandedApprovals;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

class OwnerAccountAgentJobsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    public function test_banned_approved_work_is_closed_with_a_receipt_instead_of_blocking_the_recovery_queue(): void
    {
        $this->bootV2();
        $conn = $this->providerInstall('gmail', 'owner@example.test', 'fake-token');
        $this->grant($conn, ['gmail_read', 'gmail_search', 'gmail_send']);
        $run = $this->admit('Send the reviewed summary.');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $conn,
            ['to' => 'test@example.test', 'subject' => 'Summary', 'body' => 'Synthetic test.'], 'ban-job')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'approved', 'decision' => 'allow']);
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'running']);
        $this->user->forceFill(['owner_banned_at' => now()])->save();
        $this->travel(6)->minutes();
        $this->assertSame(1, app(StrandedApprovals::class)->sweep(5)['refused']);
        $this->assertDatabaseHas('agent_tool_actions', ['id' => $action['id'], 'state' => 'refused']);
        $this->assertDatabaseHas('agent_receipts', ['action_id' => $action['id'], 'outcome' => 'refused']);
        $this->assertSame(0, app(StrandedApprovals::class)->sweep(5)['refused']);
        $this->assertSame(0, $this->sent('POST', '#gmail#'));
    }

    public function test_legacy_connector_and_teammate_guards_refuse_before_credentials_or_provider_use(): void
    {
        $this->bootV2();
        $this->user->forceFill(['owner_banned_at' => now()])->save();
        $result = app(\App\Services\ChatConnectors\ConnectorTools::class)->run($this->user->id, 'gmail', 'gmail_send', []);
        $this->assertSame('refused', $result['result']['outcome']);
        Http::assertNothingSent();
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        \App\Services\Agents\TaskContext::validate($this->user->id, []);
    }
}
