<?php

namespace Tests\Feature;

use App\Models\{AccountAuditEvent, User};
use App\Models\AgentV2\Run;
use App\Services\Account\AccountDeletion;
use App\Services\AgentRuns\Events;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Roadmap Part 19: the person's own journal retention, deleting a run's history, and a deleted account leaving nothing behind. */
class AccountRetentionTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private array $template;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->template = (array) DB::table('agent_runs')->where('id', $this->admit('template run')['id'])->first();
        config(['reliability.retention.enabled' => true, 'platform.activity' => true, 'agents_v2.retention.events_days' => 90]);
    }

    /** A finished run with two journal events, one tool action and one receipt, for the signed-in account unless told otherwise. */
    private function finishedRun(int $daysAgo = 10, ?User $owner = null, string $state = 'completed'): string
    {
        $owner ??= $this->user;
        $run = $owner->is($this->user) ? $this->admit('Run '.Str::random(6)) : $this->runFor($owner);
        $id = $run['id'];
        DB::table('agent_runs')->where('id', $id)->update(['state' => $state, 'finished_at' => now()->subDays($daysAgo)]);
        $model = Run::query()->findOrFail($id);
        app(Events::class)->append($model, 'run.note', ['n' => 1]);
        app(Events::class)->append($model, 'run.note', ['n' => 2]);
        $action = (string) Str::uuid();
        DB::table('agent_tool_actions')->insert(['id' => $action, 'run_id' => $id, 'user_id' => $owner->id, 'call_id' => 'c1', 'tool' => 'gmail_read', 'kind' => 'read',
            'connection_id' => (string) Str::uuid(), 'connection_generation' => 1, 'grant_id' => (string) Str::uuid(), 'grant_revision' => 1,
            'arguments' => '{"q":"private query"}', 'args_hash' => str_repeat('a', 64), 'schema_revision' => '1', 'state' => 'done',
            'result' => '{"snippet":"private mail"}', 'summary' => 'Read 1 message', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('agent_receipts')->insert(['id' => (string) Str::uuid(), 'run_id' => $id, 'action_id' => $action, 'status' => 'confirmed',
            'summary' => 'Read 1 message', 'created_at' => now(), 'updated_at' => now()]);
        return $id;
    }

    private function runFor(User $owner): array
    {
        $id = (string) Str::uuid();
        DB::table('agent_runs')->insert(array_merge($this->template, ['id' => $id, 'user_id' => $owner->id, 'agent_id' => (string) Str::uuid(), 'idempotency_key' => 'k'.Str::random(8),
            'conversation_seq' => 1, 'event_seq' => 0, 'conversation_id' => null]));
        return ['id' => $id];
    }

    private function events(string $run): int
    {
        return DB::table('agent_run_events')->where('run_id', $run)->count();
    }

    public function test_it_is_not_there_while_the_flag_is_off(): void
    {
        config(['reliability.retention.enabled' => false]);
        $this->getJson('/api/account/retention')->assertNotFound()->assertJsonPath('code', 'not_available');
        $this->putJson('/api/account/retention', ['days' => 30])->assertNotFound();
        $this->deleteJson('/api/account/runs/'.Str::uuid().'/history')->assertNotFound();
    }

    public function test_the_choices_stay_within_the_servers_maximum(): void
    {
        $this->getJson('/api/account/retention')->assertOk()->assertJsonPath('maxDays', 90)->assertJsonPath('choices', [7, 30, 90])
            ->assertJsonPath('days', 90)->assertJsonPath('serverDays', 90);
        config(['agents_v2.retention.events_days' => 45]);
        $this->getJson('/api/account/retention')->assertJsonPath('choices', [7, 30, 45]);
        config(['agents_v2.retention.events_days' => 0]); // the server keeps journals until told otherwise
        $this->getJson('/api/account/retention')->assertJsonPath('maxDays', 365)->assertJsonPath('serverDays', null)->assertJsonPath('days', null);
    }

    public function test_a_person_can_choose_shorter_never_longer_and_can_go_back(): void
    {
        $this->putJson('/api/account/retention', ['days' => 30])->assertOk()->assertJsonPath('days', 30);
        $this->getJson('/api/account/retention')->assertJsonPath('days', 30);
        $this->putJson('/api/account/retention', ['days' => 365])->assertStatus(422)->assertJsonPath('code', 'retention_not_allowed');
        $this->putJson('/api/account/retention', ['days' => 13])->assertStatus(422);
        $this->putJson('/api/account/retention', [])->assertStatus(422);
        $this->getJson('/api/account/retention')->assertJsonPath('days', 30);
        $this->putJson('/api/account/retention', ['days' => null])->assertOk()->assertJsonPath('days', 90);
        $this->assertSame(['retention.changed', 'retention.changed'], AccountAuditEvent::orderBy('id')->pluck('event')->all());
        $this->assertSame(['days' => 30], AccountAuditEvent::orderBy('id')->first()->detail);
    }

    public function test_the_daily_prune_applies_each_persons_own_choice_and_only_to_finished_runs(): void
    {
        $other = User::factory()->create();
        $old = $this->finishedRun(10);
        $recent = $this->finishedRun(3);
        $live = $this->finishedRun(10, null, 'running');
        $theirs = $this->finishedRun(10, $other);
        $this->putJson('/api/account/retention', ['days' => 7])->assertOk();
        $before = $this->events($old);
        $this->assertGreaterThan(0, $before);
        $this->artisan('vibyra:agent-v2-retention')->assertSuccessful();
        $this->assertSame(0, $this->events($old), 'older than my choice: journal gone');
        $this->assertGreaterThan(0, $this->events($recent), 'newer than my choice: kept');
        $this->assertGreaterThan(0, $this->events($live), 'still running: kept');
        $this->assertGreaterThan(0, $this->events($theirs), 'another person without a choice: the server default applies, not mine');
        $this->assertTrue(DB::table('agent_runs')->where('id', $old)->exists(), 'the run itself stays');
        $this->assertSame(1, DB::table('agent_receipts')->where('run_id', $old)->count(), 'receipts are not aged out by a journal choice');
    }

    public function test_a_choice_keeps_applying_after_the_control_is_switched_off(): void
    {
        $old = $this->finishedRun(10);
        $this->putJson('/api/account/retention', ['days' => 7])->assertOk();
        config(['reliability.retention.enabled' => false]);
        $this->artisan('vibyra:agent-v2-retention')->assertSuccessful();
        $this->assertSame(0, $this->events($old));
    }

    public function test_deleting_a_runs_history_removes_journal_receipts_and_tool_data_but_not_the_run(): void
    {
        $run = $this->finishedRun();
        $mine = DB::table('agent_runs')->where('id', $run)->value('prompt');
        $this->deleteJson('/api/account/runs/'.$run.'/history')->assertOk()->assertJsonPath('receipts', 1)->assertJsonPath('events', fn ($n) => $n >= 2);
        $this->assertSame(0, $this->events($run));
        $this->assertSame(0, DB::table('agent_receipts')->where('run_id', $run)->count());
        $action = DB::table('agent_tool_actions')->where('run_id', $run)->first();
        $this->assertSame('{}', $action->arguments);
        $this->assertNull($action->result);
        $this->assertNull($action->summary);
        $this->assertSame($mine, DB::table('agent_runs')->where('id', $run)->value('prompt'));
        $this->deleteJson('/api/account/runs/'.$run.'/history')->assertOk()->assertJsonPath('events', 0); // idempotent
        $this->assertSame('run_history.deleted', AccountAuditEvent::orderByDesc('id')->first()->event);
    }

    public function test_a_live_run_and_someone_elses_run_cannot_have_their_history_deleted(): void
    {
        $other = User::factory()->create();
        $theirs = $this->finishedRun(10, $other);
        $live = $this->finishedRun(1, null, 'running');
        $this->deleteJson('/api/account/runs/'.$theirs.'/history')->assertNotFound()->assertJsonPath('code', 'run_not_found');
        $this->deleteJson('/api/account/runs/'.$live.'/history')->assertStatus(409)->assertJsonPath('code', 'run_still_active');
        $this->deleteJson('/api/account/runs/'.Str::uuid().'/history')->assertNotFound();
        $this->assertGreaterThan(0, $this->events($theirs));
        $this->assertGreaterThan(0, $this->events($live));
    }

    public function test_the_browser_session_has_the_same_controls(): void
    {
        $run = $this->finishedRun();
        $this->app['auth']->forgetGuards();
        $this->withToken('')->getJson('/web-api/account/retention')->assertUnauthorized();
        $this->actingAs($this->user)->withToken('')->putJson('/web-api/account/retention', ['days' => 30])->assertOk()->assertJsonPath('days', 30);
        $this->actingAs($this->user)->withToken('')->deleteJson('/web-api/account/runs/'.$run.'/history')->assertOk();
    }

    public function test_deleting_the_account_leaves_no_journal_receipt_or_tool_row_and_touches_nobody_else(): void
    {
        $other = User::factory()->create();
        $mineRuns = [$this->finishedRun(1), $this->finishedRun(40), $this->finishedRun(1, null, 'running')];
        $theirRun = $this->finishedRun(1, $other);
        // A receipt whose run row is already gone (an old cascade): its tool action still names the account.
        $strayRun = $this->finishedRun(2);
        $strayAction = DB::table('agent_tool_actions')->where('run_id', $strayRun)->value('id');
        DB::table('agent_runs')->where('id', $strayRun)->delete();
        $mineRuns[] = $strayRun;
        $this->putJson('/api/account/retention', ['days' => 30]);
        $id = $this->user->id;
        $actions = DB::table('agent_tool_actions')->whereIn('run_id', $mineRuns)->pluck('id')->all();

        $this->assertTrue(app(AccountDeletion::class)->delete($this->user));

        $this->assertSame(0, DB::table('agent_run_events')->whereIn('run_id', $mineRuns)->count(), 'journal rows');
        $this->assertSame(0, DB::table('agent_receipts')->whereIn('run_id', $mineRuns)->count(), 'receipts by run');
        $this->assertSame(0, DB::table('agent_receipts')->whereIn('action_id', [...$actions, $strayAction])->count(), 'receipts by action');
        $this->assertSame(0, DB::table('agent_tool_actions')->where('user_id', $id)->count());
        $this->assertSame(0, DB::table('agent_runs')->where('user_id', $id)->count());
        $this->assertSame(0, DB::table('account_privacy_settings')->where('user_id', $id)->count());
        $this->assertGreaterThan(0, $this->events($theirRun), "someone else's journal is untouched");
        $this->assertSame(1, DB::table('agent_receipts')->where('run_id', $theirRun)->count());
        // The sweeper has nothing left to find for this account: no orphan of any kind remains.
        $orphans = app(\App\Services\AgentRuns\Retention::class)->prune()['orphans'];
        $this->assertSame(0, $orphans);
    }
}
