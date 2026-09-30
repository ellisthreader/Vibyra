<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\{Approvals, DispatchSweeper};
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Event, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/**
 * An `approved` action a crash stranded between the approval commit and the dispatch claim: the sweeper dispatches it once through
 * the normal path, or refuses it with a receipt; it never touches an action that carries a dispatch marker, nor a Mac action whose
 * Mac may still claim it. The state is staged (SQLite cannot kill a process); the Postgres harness (scenario `stranded`) does the real kill -9.
 */
class AgentV2StrandedApprovalTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const GMAIL = '#gmail\.googleapis\.com/gmail/v1/users/me/messages';
    private const SEND = ['to' => 'board@example.com', 'subject' => 'Weekly summary', 'body' => 'Two seeded emails.'];
    private const NONE = ['confirmed' => 0, 'unknown' => 0, 'failed' => 0, 'dispatched' => 0, 'refused' => 0];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    /** A gmail_send the person approved (committed `approved`, run running) whose process then died before the dispatch claim. */
    private function stranded(): array
    {
        $conn = $this->providerInstall('gmail', 'owner@example.com', 'gmail-token');
        $this->grant($conn, ['gmail_read', 'gmail_search', 'gmail_send']);
        $run = $this->admit('Email the board.');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $conn, self::SEND, 'w1')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'approved', 'decision' => 'allow']);
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'running']);
        return [$run, $claimed, $action, $conn];
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

    private function sendRoute(): void
    {
        $this->route('POST', self::GMAIL.'/send#', Http::response(['id' => 'sent-1', 'threadId' => 't-sent']));
        $this->route('GET', self::GMAIL.'\?#', Http::response(['messages' => []]));
    }

    private function events(string $runId, string $type): int
    {
        return DB::table('agent_run_events')->where('run_id', $runId)->where('type', $type)->count();
    }

    public function test_a_stranded_approved_send_is_dispatched_once_by_the_sweeper_and_the_run_completes(): void
    {
        $this->sendRoute();
        [$run, $claimed, $action] = $this->stranded();
        $this->complete($claimed)->assertStatus(409)->assertJsonPath('code', 'actions_open');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'approved');
        $this->assertNull($this->row($action['id'])->dispatched_at, 'A retried approval is a duplicate no-op: it sends nothing and claims nothing.');
        $this->travel(4)->minutes();
        $this->assertSame(self::NONE, $this->sweep(), 'Younger than dispatch_stale_minutes: left alone.');
        $this->travel(2)->minutes();
        $this->artisan('vibyra:agent-v2-sweep-dispatching')->expectsOutput('confirmed=0 unknown=0 failed=0 dispatched=1 refused=0')->assertSuccessful();
        $row = $this->row($action['id']);
        $this->assertSame('completed', $row->state);
        $this->assertNotNull($row->dispatched_at, 'The claim marker is written with the claim.');
        $receipt = DB::table('agent_receipts')->where('action_id', $action['id'])->get();
        $this->assertSame([1, 'confirmed', 'sent-1'], [$receipt->count(), $receipt[0]->status, $receipt[0]->provider_resource_id]);
        $this->assertSame([1, 0], [$this->sent('POST', self::GMAIL.'/send#'), $this->sent('GET', self::GMAIL.'\?#')], 'One send, no lookup: this was never sent before.');
        $this->assertSame(self::NONE, $this->sweep());
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'completed');
        $this->assertSame([1, 1], [$this->sent('POST', self::GMAIL.'/send#'), $this->events($run['id'], 'tool.result')]);
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'completed');
    }

    public function test_a_rival_sweeper_and_a_late_approval_retry_inside_the_first_sweepers_window_cause_exactly_one_send(): void
    {
        $this->sendRoute();
        [, , $action] = $this->stranded();
        $this->travel(6)->minutes();
        $armed = true;
        // The first sweeper has started its dispatch transaction but has not read the action yet: a late retry, then a whole rival sweep, land here.
        DB::beforeExecuting(function (string $sql) use (&$armed, $action) {
            if (!$armed || !str_starts_with($sql, 'select "run_id" from "agent_tool_actions"')) return;
            $armed = false;
            app(Approvals::class)->decide($this->user->id, $action['id'], $this->fingerprintOf($action), 'allow');
            $this->assertSame(['dispatched' => 1, 'refused' => 0, 'unknown' => 0, 'failed' => 0], app(\App\Services\AgentRuns\Tools\StrandedApprovals::class)->sweep(5));
        });
        $this->assertSame(self::NONE, $this->sweep(), 'The first sweeper finds the action already claimed and sent by the rival: it does nothing.');
        $this->assertSame([1, 'completed'], [$this->sent('POST', self::GMAIL.'/send#'), $this->row($action['id'])->state]);
    }

    public function test_an_action_touched_after_the_sweeper_picked_it_is_no_longer_stranded_and_is_left_alone(): void
    {
        $this->sendRoute();
        [, , $action] = $this->stranded();
        $this->travel(6)->minutes();
        $armed = true;
        DB::beforeExecuting(function (string $sql) use (&$armed, $action) {
            if (!$armed || !str_starts_with($sql, 'select "run_id" from "agent_tool_actions"')) return;
            $armed = false;
            DB::table('agent_tool_actions')->where('id', $action['id'])->update(['updated_at' => now()]);
        });
        $this->assertSame(self::NONE, $this->sweep(), 'Re-checked under the lock: approved again a moment ago is not stranded.');
        $this->assertSame(['approved', 0], [$this->row($action['id'])->state, $this->sent('POST', self::GMAIL.'/send#')]);
    }

    public function test_a_grant_revoked_or_an_approval_expired_while_stranded_is_refused_with_a_receipt_and_the_run_is_unblocked(): void
    {
        $this->sendRoute();
        [$run, $claimed, $action, $conn] = $this->stranded();
        $this->grant($conn, ['gmail_read']); // the person removed "send" meanwhile
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'refused' => 1], $this->sweep());
        $row = $this->row($action['id']);
        $this->assertSame(['refused', 'Access changed before this action ran'], [$row->state, $row->summary]);
        $this->assertSame(['failed', 'refused'], [DB::table('agent_receipts')->where('action_id', $action['id'])->value('status'), DB::table('agent_receipts')->where('action_id', $action['id'])->value('outcome')]);
        $this->assertSame(1, $this->events($run['id'], 'tool.result'));
        $this->assertSame(0, $this->sent('POST', self::GMAIL.'/send#'));
        $this->getJson($this->runnerPath('/runs/'.$run['id'].'/actions/'.$action['id'].'?generation='.$claimed['generation']), $this->runnerHeaders())
            ->assertOk()->assertJsonPath('action.state', 'refused')->assertJsonPath('action.receipt.outcome', 'refused');
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'completed');

        $this->grant($conn, ['gmail_read', 'gmail_search', 'gmail_send']);
        [$run2, $claimed2, $late] = $this->stranded2();
        $this->travel(16)->minutes(); // the approval window (15 minutes from the request) has closed
        $this->assertSame([...self::NONE, 'refused' => 1], $this->sweep());
        $this->assertSame('Approval expired before this action ran', $this->row($late['id'])->summary);
        $this->assertSame(0, $this->sent('POST', self::GMAIL.'/send#'));
        $this->complete($claimed2)->assertOk();
    }

    /** A second stranded send for the same teammate (the first run is finished). */
    private function stranded2(): array
    {
        $conn = DB::table('agent_connections')->where('provider', 'gmail')->value('id');
        $run = $this->admit('Email again.');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $conn, self::SEND, 'w2')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'approved', 'decision' => 'allow']);
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'running']);
        return [$run, $claimed, $action];
    }

    public function test_a_stranded_approval_on_a_finished_run_is_refused_not_sent(): void
    {
        $this->sendRoute();
        [$run, , $action] = $this->stranded();
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'failed', 'finished_at' => now()]);
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'refused' => 1], $this->sweep());
        $this->assertSame([0, 'refused'], [$this->sent('POST', self::GMAIL.'/send#'), $this->row($action['id'])->state]);
    }

    public function test_an_action_with_a_dispatch_marker_is_never_dispatched_again_and_goes_through_the_dispatching_path(): void
    {
        $this->sendRoute();
        [, , $action] = $this->stranded();
        $armed = true;
        Event::listen(TransactionCommitted::class, function () use (&$armed, $action) { // the process dies right after the claim commits
            if ($armed && $this->row($action['id'])->state === 'dispatching') { $armed = false; throw new \RuntimeException('simulated crash after the claim commit'); }
        });
        $this->travel(6)->minutes();
        $this->assertSame(self::NONE, $this->sweep(), 'The claim committed, the crash came before the send.');
        $row = $this->row($action['id']);
        $this->assertSame(['dispatching', 0], [$row->state, $this->sent('POST', self::GMAIL.'/send#')]);
        $this->assertNotNull($row->dispatched_at);
        $this->assertSame(self::NONE, $this->sweep(), 'Inside the window the dispatching sweeper leaves it too.');
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'unknown' => 1], $this->sweep(), 'Past the window: one read-only lookup, then unknown.');
        $this->assertSame([0, 1, 'unknown'], [$this->sent('POST', self::GMAIL.'/send#'), $this->sent('GET', self::GMAIL.'\?#'), $this->row($action['id'])->state]);

        [, , $marked] = $this->stranded2();
        DB::table('agent_tool_actions')->where('id', $marked['id'])->update(['dispatched_at' => now()]); // an impossible row: approved yet marked
        $this->travel(6)->minutes();
        $this->assertSame(self::NONE, $this->sweep());
        $this->assertSame(['approved', 0], [$this->row($marked['id'])->state, $this->sent('POST', self::GMAIL.'/send#')]);
    }
}
