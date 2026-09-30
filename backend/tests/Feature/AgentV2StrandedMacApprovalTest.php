<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\DispatchSweeper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/**
 * An `approved` Mac action (computer or browser) is claimed by the leased runner, so the sweeper never dispatches it from the server:
 * it closes one only after the run's lease lapsed and the window passed (a write as `unknown`, a read as retryable). State is staged.
 */
class AgentV2StrandedMacApprovalTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2ComputerFixture, AgentV2Routes;

    private const NONE = ['confirmed' => 0, 'unknown' => 0, 'failed' => 0, 'dispatched' => 0, 'refused' => 0];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function sweep(): array
    {
        return app(DispatchSweeper::class)->sweep();
    }

    private function row(string $id): object
    {
        return DB::table('agent_tool_actions')->find($id);
    }

    private function complete(array $claimed)
    {
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => 'Done.'], $this->runnerHeaders());
    }

    public function test_an_approved_mac_write_is_untouched_until_the_lease_lapsed_then_unknown_and_never_dispatched_by_the_server(): void
    {
        Http::fake();
        $this->bootComputer();
        $conn = $this->computerConnection();
        $this->admit('Fix notes.');
        $claimed = $this->claim();
        $edit = $this->callTool($claimed, 'workspace_edit', $conn, ['path' => 'notes.txt', 'content' => "fixed\n", 'expectedSha256' => 'new'], 'w1')->json('action');
        $this->decide($edit)->assertOk();
        $this->assertSame(['approved', null], [$this->row($edit['id'])->state, $this->row($edit['id'])->dispatched_at], 'Approval leaves a Mac action for the Mac to claim.');
        $this->travel(4)->minutes();
        $this->assertSame(self::NONE, $this->sweep(), 'The lease lapsed but the window has not: left alone.');
        $this->travel(2)->minutes();
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/heartbeat'), ['generation' => $claimed['generation']], $this->runnerHeaders())->assertOk();
        $this->assertSame(self::NONE, $this->sweep(), 'A Mac that still holds the lease may claim it.');
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        $this->assertSame([...self::NONE, 'unknown' => 1], $this->sweep());
        $row = $this->row($edit['id']);
        $this->assertSame('unknown', $row->state);
        $this->assertStringContainsString('did not pick this change up', json_decode($row->result, true)['error']);
        $this->assertSame('outcome_unknown', DB::table('agent_receipts')->where('action_id', $edit['id'])->value('outcome'));
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'outcome_unknown');
        Http::assertNothingSent();
    }

    public function test_an_unclaimed_mac_read_fails_retryable_only_once_the_lease_lapsed(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $this->admit('List files.');
        $claimed = $this->claim();
        $read = $this->callTool($claimed, 'workspace_list', $conn, ['path' => ''], 'r1')->assertOk()->assertJsonPath('action.state', 'approved')->json('action');
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'failed' => 1], $this->sweep());
        $this->assertSame('retryable', json_decode($this->row($read['id'])->result, true)['outcome']);
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'completed');
    }
}
