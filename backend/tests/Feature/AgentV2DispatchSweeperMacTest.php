<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Computer\ComputerPublish;
use App\Services\AgentRuns\Tools\DispatchSweeper;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** The sweeper for Mac-claimed actions and branch publishes, its window and flag, and its schedule (state staged directly). */
class AgentV2DispatchSweeperMacTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2ComputerFixture, AgentV2Routes;

    private const GMAIL = '#gmail\.googleapis\.com/gmail/v1/users/me/messages';
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

    public function test_a_mac_write_is_swept_only_after_its_lease_lapsed_and_marked_unknown_per_the_contract(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $run = $this->admit('Fix notes.');
        $claimed = $this->claim();
        $edit = $this->callTool($claimed, 'workspace_edit', $conn, ['path' => 'notes.txt', 'content' => "fixed\n", 'expectedSha256' => 'new'], 'w1')->json('action');
        $this->decide($edit)->assertOk();
        $this->macClaim($claimed, $edit)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $this->travel(6)->minutes();
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/heartbeat'), ['generation' => $claimed['generation']], $this->runnerHeaders())->assertOk();
        $this->assertSame(self::NONE, $this->sweep(), 'A Mac that still holds the lease is alive, however long its action runs.');
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        $this->assertSame([...self::NONE, 'unknown' => 1], $this->sweep());
        $row = $this->row($edit['id']);
        $this->assertSame('unknown', $row->state);
        $this->assertStringContainsString('The Mac stopped while this change was running', json_decode($row->result, true)['error']);
        $this->assertSame('outcome_unknown', DB::table('agent_receipts')->where('action_id', $edit['id'])->value('outcome'));
        $this->complete($claimed)->assertOk()->assertJsonPath('run.state', 'outcome_unknown');
    }

    public function test_a_branch_publish_that_never_started_is_refused_and_a_late_job_writes_nothing_while_one_that_was_writing_is_unknown(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $this->admit('Publish.');
        $claimed = $this->claim();
        $make = function (string $phase, string $id) use ($claimed, $conn) {
            $a = $this->callTool($claimed, 'workspace_read', $conn, ['path' => $id.'.txt'], $id)->json('action');
            DB::table('agent_tool_actions')->where('id', $a['id'])->update(['state' => 'dispatching', 'phase' => $phase, 'claimed_generation' => $claimed['generation']]);
            return $a['id'];
        };
        [$uploaded, $writing] = [$make('uploaded', 'u'), $make('writing', 'w')];
        $this->travel(10)->minutes();
        $this->assertSame(self::NONE, $this->sweep(), 'A queued publish job may take up to its 15 minute timeout.');
        $this->travel(15)->minutes();
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/heartbeat'), ['generation' => $claimed['generation']], $this->runnerHeaders())->assertOk();
        $this->assertSame([...self::NONE, 'failed' => 1, 'unknown' => 1], $this->sweep(), 'A live lease does not keep a publish alive: the Mac is done, the server job owns it.');
        $this->assertSame(['failed', 'unknown'], [$this->row($uploaded)->state, $this->row($writing)->state]);
        $this->assertSame('refused', DB::table('agent_receipts')->where('action_id', $uploaded)->value('outcome'));
        app(ComputerPublish::class)->run($uploaded, ['branch' => 'x']); // a late job: nothing to reserve, so no GitHub request (strays are blocked)
        $this->assertSame('failed', $this->row($uploaded)->state);
    }

    public function test_the_window_is_configurable_the_flag_gates_the_command_and_it_is_scheduled_every_minute_on_one_server(): void
    {
        $conn = $this->providerInstall('gmail', 'owner@example.com', 'gmail-token');
        $this->grant($conn, ['gmail_send']);
        $this->admit('Email.');
        $action = $this->callTool($this->claim(), 'gmail_send', $conn, ['to' => 'b@example.com', 'subject' => 'S', 'body' => 'B'], 'w1')->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'dispatching', 'dispatched_at' => now()]);
        $this->route('GET', self::GMAIL.'\?#', Http::response(['messages' => []]));
        config(['agents_v2.dispatch_stale_minutes' => 10]);
        $this->travel(6)->minutes();
        $this->assertSame(self::NONE, $this->sweep());
        $this->travel(5)->minutes();
        config(['agents_v2.enabled' => false]);
        $this->artisan('vibyra:agent-v2-sweep-dispatching')->assertSuccessful();
        $this->assertSame('dispatching', $this->row($action['id'])->state);
        config(['agents_v2.enabled' => true]);
        $this->artisan('vibyra:agent-v2-sweep-dispatching')->expectsOutput('confirmed=0 unknown=1 failed=0 dispatched=0 refused=0')->assertSuccessful();
        $event = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains((string) $e->command, 'vibyra:agent-v2-sweep-dispatching'));
        $this->assertNotNull($event, 'Not registered in routes/console.php.');
        $this->assertSame(['* * * * *', true, true], [$event->expression, $event->withoutOverlapping, $event->onOneServer]);
        config(['agents_v2.enabled' => false]);
        $this->assertFalse($event->filtersPass($this->app));
        config(['agents_v2.enabled' => true]);
        $this->assertTrue($event->filtersPass($this->app));
    }
}
