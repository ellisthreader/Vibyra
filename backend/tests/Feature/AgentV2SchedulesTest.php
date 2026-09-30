<?php

namespace Tests\Feature;

use App\Models\AgentV2\Occurrence;
use App\Models\AgentV2\Schedule;
use App\Services\AgentSchedules\Scheduler;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2SchedulesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        // Thursday 1 October 2026, 07:00 UTC (08:00 in London, BST).
        $this->travelTo(CarbonImmutable::parse('2026-10-01 07:00:00', 'UTC'));
        $this->bootV2();
    }

    private function schedule(array $extra = []): array
    {
        return $this->postJson('/api/agents/v2/schedules', [...['agentId' => $this->agent['id'], 'prompt' => 'Summarize new mail.',
            'timezone' => 'Europe/London', 'recurrence' => ['type' => 'daily', 'time' => '09:00']], ...$extra])
            ->assertCreated()->json('schedule');
    }

    private function at(string $utc, bool $online = true): array
    {
        $this->travelTo(CarbonImmutable::parse($utc, 'UTC'));
        if ($online) DB::table('agent_runtime_bindings')->update(['last_seen_at' => now()]);
        return app(Scheduler::class)->tick();
    }

    public function test_crud_preview_history_and_capabilities(): void
    {
        $preview = $this->postJson('/api/agents/v2/schedules/preview', ['timezone' => 'Europe/London',
            'recurrence' => ['type' => 'daily', 'time' => '09:00'], 'count' => 2])->assertOk();
        $this->assertSame(['2026-10-01T08:00:00+00:00', '2026-10-02T08:00:00+00:00'], array_column($preview->json('next'), 'at'));
        $this->assertSame('2026-10-01T09:00:00+01:00', $preview->json('next.0.local'));
        $s = $this->schedule(['title' => 'Morning mail']);
        $this->assertSame('2026-10-01T08:00:00+00:00', $s['nextRunAt']);
        $this->assertSame(['type' => 'daily', 'time' => '09:00'], $s['recurrence']);
        $this->getJson('/api/agents/v2/schedules?agentId='.$this->agent['id'])->assertOk()->assertJsonCount(1, 'schedules');
        $this->postJson('/api/agents/v2/schedules', ['agentId' => $this->agent['id'], 'prompt' => 'x', 'timezone' => 'Europe/London',
            'recurrence' => ['type' => 'once', 'date' => '2026-09-01', 'time' => '09:00']])->assertStatus(422)->assertJsonPath('code', 'no_future_run');
        $this->getJson('/api/agents/v2/capabilities')->assertOk()->assertJsonPath('routines', true)->assertJsonPath('triggers', true);
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('capabilities.routines', false);
        config(['agents_v2.user_ids' => '999999']);
        $this->getJson('/api/agents/v2/capabilities')->assertOk()->assertJsonPath('routines', false)->assertJsonPath('triggers', false);
        $this->getJson('/api/agents/v2/schedules')->assertStatus(403);
        config(['agents_v2.user_ids' => (string) $this->user->id]);
        $this->deleteJson('/api/agents/v2/schedules/'.$s['id'])->assertOk();
        $this->getJson('/api/agents/v2/schedules/'.$s['id'])->assertStatus(404);
        $this->getJson('/api/agents/v2/schedules/'.$s['id'].'/occurrences')->assertOk()->assertJsonCount(0, 'occurrences');
    }

    public function test_a_due_occurrence_admits_one_run_even_with_duplicate_scheduler_workers(): void
    {
        $s = $this->schedule();
        $stale = Schedule::query()->findOrFail($s['id']);
        $this->assertSame(['claimed' => 1, 'admitted' => 1, 'expired' => 0], $this->at('2026-10-01 08:00:30'));
        $this->assertSame(['claimed' => 0, 'admitted' => 0, 'expired' => 0], $this->at('2026-10-01 08:00:40'));
        $this->assertNull(app(Scheduler::class)->claim($stale, CarbonImmutable::now()), 'A worker holding the old row loses the claim.');
        $occurrence = Occurrence::query()->sole();
        $this->assertSame('admitted', app(Scheduler::class)->admit($occurrence), 'A retried admission returns the same run.');
        $run = DB::table('agent_runs')->sole();
        $this->assertSame($run->id, $occurrence->fresh()->run_id);
        $this->assertSame('Summarize new mail.', $run->prompt);
        $this->assertSame('queued', $run->state);
        $this->assertSame('connected_account', $run->funding_source);
        $this->assertSame('sched:'.$s['id'].':1:'.CarbonImmutable::parse('2026-10-01 08:00', 'UTC')->getTimestamp(), $run->idempotency_key);
        $history = $this->getJson('/api/agents/v2/schedules/'.$s['id'].'/occurrences')->assertOk()->json('occurrences.0');
        $this->assertSame(['admitted', $run->id, 'queued'], [$history['state'], $history['runId'], $history['runState']]);
        $this->assertSame('2026-10-02T08:00:00+00:00', $this->getJson('/api/agents/v2/schedules/'.$s['id'])->json('schedule.nextRunAt'));
    }

    public function test_the_next_occurrence_is_skipped_while_the_previous_run_is_still_active(): void
    {
        $this->schedule();
        $this->at('2026-10-01 08:00:10');
        $this->at('2026-10-02 08:00:10');
        $this->assertSame(1, DB::table('agent_runs')->count());
        $this->assertSame(['admitted', 'skipped'], Occurrence::query()->orderBy('intended_at')->pluck('state')->all());
        $this->assertSame('previous_run_active', Occurrence::query()->orderByDesc('intended_at')->value('reason'));
        $this->schedule(['overlap' => 'queue', 'recurrence' => ['type' => 'daily', 'time' => '10:00']]);
        $this->at('2026-10-02 09:00:10');
        $this->at('2026-10-03 09:00:10');
        $this->assertSame(3, DB::table('agent_runs')->count(), 'The queue policy admits behind the active run.');
    }

    public function test_an_offline_mac_waits_then_expires_and_missed_days_never_burst(): void
    {
        $s = $this->schedule();
        $this->at('2026-10-01 08:00:30', false);
        $this->assertSame('waiting', Occurrence::query()->value('state'));
        $this->assertSame('waiting_for_computer', DB::table('agent_runs')->value('state'));
        $this->assertSame(0, $this->at('2026-10-01 08:59:00', false)['expired']);
        $this->assertSame(1, $this->at('2026-10-01 09:01:00', false)['expired']);
        $this->assertSame(['expired', 'computer_offline'], [Occurrence::query()->value('state'), Occurrence::query()->value('reason')]);
        $run = DB::table('agent_runs')->sole();
        $this->assertSame(['failed', 'occurrence_expired'], [$run->state, $run->state_reason]);
        $this->assertTrue(DB::table('agent_run_events')->where('run_id', $run->id)->where('type', 'run.failed')->exists());
        // Scheduler down for days: only the latest occurrence inside the window is caught up.
        $this->at('2026-10-05 08:20:00');
        $this->assertSame(2, Occurrence::query()->count());
        $this->assertSame(2, DB::table('agent_runs')->count());
        $this->assertSame('2026-10-05 08:00:00', Occurrence::query()->orderByDesc('intended_at')->first()->intended_at->format('Y-m-d H:i:s'));
        // Beyond the window nothing runs; one expired row explains it.
        DB::table('agent_runs')->where('state', 'queued')->update(['state' => 'completed']);
        $this->at('2026-10-07 12:00:00');
        $last = Occurrence::query()->orderByDesc('intended_at')->first();
        $this->assertSame(['expired', 'missed_window'], [$last->state, $last->reason]);
        $this->assertSame(2, DB::table('agent_runs')->count());
        $this->assertSame('2026-10-08T08:00:00+00:00', $this->getJson('/api/agents/v2/schedules/'.$s['id'])->json('schedule.nextRunAt'));
    }

    public function test_pause_edit_and_delete_stop_future_occurrences(): void
    {
        $s = $this->schedule();
        $this->postJson('/api/agents/v2/schedules/'.$s['id'].'/pause', ['paused' => true])->assertOk()->assertJsonPath('schedule.nextRunAt', null);
        $this->at('2026-10-01 08:00:30');
        $this->assertSame(0, Occurrence::query()->count());
        $this->postJson('/api/agents/v2/schedules/'.$s['id'].'/pause', ['paused' => false])->assertOk()
            ->assertJsonPath('schedule.nextRunAt', '2026-10-02T08:00:00+00:00');
        // A claimed-but-not-admitted occurrence of revision 1 is never admitted after an edit.
        $this->travelTo(CarbonImmutable::parse('2026-10-02 08:00:05', 'UTC'));
        $claimed = app(Scheduler::class)->claim(Schedule::query()->findOrFail($s['id']), CarbonImmutable::now());
        $this->assertSame('pending', $claimed->state);
        $this->patchJson('/api/agents/v2/schedules/'.$s['id'], ['revision' => 1, 'prompt' => 'Only urgent mail.'])->assertOk()
            ->assertJsonPath('schedule.revision', 2)->assertJsonPath('schedule.prompt', 'Only urgent mail.');
        $this->patchJson('/api/agents/v2/schedules/'.$s['id'], ['revision' => 1, 'prompt' => 'x'])->assertStatus(409)
            ->assertJsonPath('code', 'stale_revision');
        $this->at('2026-10-02 08:00:30');
        $this->assertSame(['skipped', 'schedule_edited'], [$claimed->fresh()->state, $claimed->fresh()->reason]);
        $this->assertSame(0, DB::table('agent_runs')->count());
        $this->at('2026-10-03 08:00:30');
        $this->assertSame('Only urgent mail.', DB::table('agent_runs')->sole()->prompt);
        $this->deleteJson('/api/agents/v2/schedules/'.$s['id'])->assertOk();
        DB::table('agent_runs')->update(['state' => 'completed']);
        $this->at('2026-10-04 08:00:30');
        $this->assertSame(1, DB::table('agent_runs')->count());
    }

    public function test_scheduled_runs_touch_no_wallet_and_use_the_saved_grants_only(): void
    {
        $tables = ['vibes_wallets', 'vibes_ledger', 'vibes_grants', 'vibes_turns', 'vibes_tools', 'vibes_spend_days'];
        DB::table('vibes_grants')->delete();
        DB::table('vibes_ledger')->delete();
        $before = array_map(fn ($t) => DB::table($t)->get()->toJson(), array_combine($tables, $tables));
        $connection = $this->gmailInstall('me@example.com');
        $this->grant($connection);
        $this->schedule();
        $this->artisan('vibyra:agent-v2-routines')->assertSuccessful();
        $this->at('2026-10-01 08:00:30');
        $run = DB::table('agent_runs')->sole();
        $this->assertSame(['gmail_read', 'gmail_search'], json_decode($run->grant_snapshot, true)[0]['operations']);
        foreach ($tables as $table) $this->assertSame($before[$table], DB::table($table)->get()->toJson(), $table.' changed.');
    }
}
