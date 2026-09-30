<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Computer\ComputerPublish;
use App\Services\AgentRuns\Tools\DispatchSweeper;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/**
 * The stuck-`dispatching` sweeper: a dead API/worker process leaves an approved write `dispatching` for ever. The state is
 * staged directly (SQLite cannot kill a process); the Postgres harness (scenario `sweeper`) does the real kill -9.
 */
class AgentV2DispatchSweeperTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2ComputerFixture, AgentV2Routes;

    private const GMAIL = '#gmail\.googleapis\.com/gmail/v1/users/me/messages';
    private const SEND = ['to' => 'board@example.com', 'subject' => 'Weekly summary', 'body' => 'Two seeded emails.'];
    private const NONE = ['confirmed' => 0, 'unknown' => 0, 'failed' => 0, 'dispatched' => 0, 'refused' => 0];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    /** A gmail_send the person approved whose API process then died: `dispatching` since now, run running. */
    private function stranded(string $tool = 'gmail_send', array $args = self::SEND): array
    {
        $conn = $this->providerInstall('gmail', 'owner@example.com', 'gmail-token');
        $this->grant($conn, ['gmail_read', 'gmail_search', 'gmail_send']);
        $run = $this->admit('Email the board.');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, $tool, $conn, $args, 'w1')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'dispatching', 'decision' => 'allow', 'dispatched_at' => now()]);
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'running']);
        return [$run, $claimed, $action];
    }

    private function complete(array $claimed)
    {
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => 'Done.'], $this->runnerHeaders());
    }

    private function sweep(): array
    {
        return app(DispatchSweeper::class)->sweep();
    }

    private function row(string $id): object
    {
        return DB::table('agent_tool_actions')->find($id);
    }

    private function events(string $runId, string $type): int
    {
        return DB::table('agent_run_events')->where('run_id', $runId)->where('type', $type)->count();
    }

    public function test_a_stranded_write_is_never_resent_ends_unknown_unblocks_complete_and_repeat_sweeps_change_nothing(): void
    {
        [$run, $claimed, $action] = $this->stranded();
        $this->route('GET', self::GMAIL.'\?#', Http::response(['messages' => []]));
        $this->travel(4)->minutes();
        $this->assertSame(self::NONE, $this->sweep(), 'Younger than dispatch_stale_minutes: left alone.');
        $this->complete($claimed)->assertStatus(409)->assertJsonPath('code', 'actions_open');
        $this->travel(2)->minutes();
        $this->assertSame([...self::NONE, 'unknown' => 1], $this->sweep());
        $row = $this->row($action['id']);
        $this->assertSame('unknown', $row->state);
        $receipt = DB::table('agent_receipts')->where('action_id', $action['id'])->get();
        $this->assertSame([1, 'unknown', 'outcome_unknown'], [$receipt->count(), $receipt[0]->status, $receipt[0]->outcome]);
        $this->assertSame(1, $this->events($run['id'], 'tool.result'));
        $this->assertSame(0, $this->sent('POST', self::GMAIL.'/send#'), 'A write is never re-dispatched.');
        $this->assertSame(1, $this->sent('GET', self::GMAIL.'\?#'), 'One read-only lookup by Message-ID.');
        Http::assertSent(fn ($r) => str_contains((string) ($r->data()['q'] ?? ''), 'rfc822msgid:<vibyra-'.$action['id']));
        $this->assertSame(self::NONE, $this->sweep());
        $this->assertSame(self::NONE, $this->sweep());
        $this->assertSame([1, 1, 1], [$this->events($run['id'], 'tool.result'), $this->sent('GET', self::GMAIL.'\?#'), DB::table('agent_receipts')->count()]);
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'outcome_unknown');
        $this->assertSame(1, $this->events($run['id'], 'run.outcome_unknown'));
        $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertJsonPath('run.actions.0.state', 'unknown')
            ->assertJsonPath('run.actions.0.receipt.outcome', 'outcome_unknown');
    }

    public function test_reconciliation_that_finds_the_message_confirms_it_and_the_run_completes_normally(): void
    {
        [$run, $claimed, $action] = $this->stranded();
        $this->route('GET', self::GMAIL.'\?#', Http::response(['messages' => [['id' => 'sent-late', 'threadId' => 't-late']]]));
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'confirmed' => 1], $this->sweep());
        $this->assertSame('completed', $this->row($action['id'])->state);
        $receipt = DB::table('agent_receipts')->where('action_id', $action['id'])->first();
        $this->assertSame(['confirmed', 'confirmed', 'sent-late'], [$receipt->status, $receipt->outcome, $receipt->provider_resource_id]);
        $this->assertTrue(json_decode($this->row($action['id'])->result, true)['reconciled']);
        $this->assertSame(0, $this->sent('POST', self::GMAIL.'/send#'));
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'completed');
    }

    public function test_a_failing_lookup_or_revoked_connection_leaves_the_write_unknown_and_still_never_resends(): void
    {
        [$run, $claimed, $action] = $this->stranded();
        $this->route('GET', self::GMAIL.'\?#', Http::response('oops', 500));
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'unknown' => 1], $this->sweep());
        $this->assertSame(0, $this->sent('POST', self::GMAIL.'/send#'));
        $this->assertSame('unknown', $this->row($action['id'])->state);
        DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->delete();
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'outcome_unknown');
    }

    public function test_cancel_after_the_sweep_ends_cancelled_with_the_action_shown_unknown(): void
    {
        $this->route('GET', self::GMAIL.'\?#', Http::response(['messages' => []]));
        [$run, , $action] = $this->stranded();
        $this->travel(6)->minutes();
        $this->sweep();
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk()->assertJsonPath('run.state', 'cancelled');
        $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertJsonPath('run.state', 'cancelled')->assertJsonPath('run.actions.0.state', 'unknown');
        $this->assertSame('unknown', $this->row($action['id'])->state);
    }

    public function test_a_sweep_after_the_cancel_still_closes_the_write_and_the_run_stays_cancelled(): void
    {
        $this->route('GET', self::GMAIL.'\?#', Http::response(['messages' => []]));
        [$run, , $action] = $this->stranded();
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk()->assertJsonPath('run.state', 'cancelled');
        $this->assertSame('dispatching', $this->row($action['id'])->state, 'Cancel never touches a write that may already be on its way.');
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'unknown' => 1], $this->sweep());
        $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertJsonPath('run.state', 'cancelled')->assertJsonPath('run.actions.0.state', 'unknown');
        $this->assertSame(0, $this->sent('POST', self::GMAIL.'/send#'));
    }

    public function test_a_stranded_read_fails_retryable_so_the_run_can_complete_normally(): void
    {
        [$run, $claimed, $action] = $this->stranded('gmail_search', ['query' => 'from:boss']);
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'waiting_for_tool']);
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'failed' => 1], $this->sweep());
        $this->assertSame('failed', $this->row($action['id'])->state);
        $this->assertSame('retryable', json_decode($this->row($action['id'])->result, true)['outcome']);
        $this->assertSame(0, $this->sent('GET', self::GMAIL.'#'), 'A read is not looked up or re-run.');
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'completed');
    }

    public function test_a_calendar_create_is_looked_up_by_its_own_event_id_and_never_created_again(): void
    {
        $conn = $this->providerInstall('google_calendar', 'owner@example.com', 'cal-token');
        $this->grant($conn, ['google_calendar_create_event']);
        $run = $this->admit('Book it.');
        $claimed = $this->claim();
        $event = ['calendarId' => 'primary', 'title' => 'Sync', 'start' => '2026-10-02T15:00:00+01:00', 'end' => '2026-10-02T15:30:00+01:00', 'timeZone' => 'Europe/London'];
        $action = $this->callTool($claimed, 'google_calendar_create_event', $conn, $event, 'w1')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'dispatching', 'decision' => 'allow', 'dispatched_at' => now()]);
        DB::table('agent_runs')->where('id', $run['id'])->update(['state' => 'running']);
        $id = \App\Services\AgentRuns\Tools\Providers\CalendarWrites::eventId($action['id']);
        $this->route('GET', '#www\.googleapis\.com/calendar/v3/calendars/primary/events/'.$id.'#', Http::response(['id' => $id, 'status' => 'confirmed',
            'summary' => 'Sync', 'start' => ['dateTime' => $event['start']], 'end' => ['dateTime' => $event['end']], 'htmlLink' => 'https://calendar.google.com/event?eid='.$id]));
        $this->travel(6)->minutes();
        $this->assertSame([...self::NONE, 'confirmed' => 1], $this->sweep());
        $this->assertSame('completed', $this->row($action['id'])->state);
        $this->assertSame($id, DB::table('agent_receipts')->where('action_id', $action['id'])->value('provider_resource_id'));
        $this->assertSame(0, $this->sent('POST', '#calendar/v3/calendars/primary/events$#'));
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'completed');
    }
}
