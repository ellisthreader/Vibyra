<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\AgentV2\Occurrence;
use App\Models\AgentV2\Schedule;
use App\Services\AgentSchedules\Scheduler;
use App\Services\Vibes\Wallet;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Support\AgentV2Fixture;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

/**
 * A routine paid in Vibyra tokens: its due occurrence starts a real Vibes turn in the teammate's conversation
 * (real quote, consent, wallet, plan window, spend caps), once, and says why when it cannot.
 */
class AgentV2TokenSchedulesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        // Thursday 1 October 2026, 07:00 UTC (08:00 in London).
        $this->travelTo(CarbonImmutable::parse('2026-10-01 07:00:00', 'UTC'));
        $this->bootV2();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        VibesCatalogue::put();
        Queue::fake();
        app(Wallet::class)->grant($this->user->id, 'test-topup', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
    }

    private function routine(array $extra = []): array
    {
        return $this->postJson('/api/agents/v2/schedules', [...['agentId' => $this->agent['id'], 'prompt' => 'Show me my important emails.',
            'timezone' => 'Europe/London', 'recurrence' => ['type' => 'daily', 'time' => '09:00'], 'funding' => 'tokens'], ...$extra])
            ->assertCreated()->json('schedule');
    }

    private function tickAt(string $utc): array
    {
        $this->travelTo(CarbonImmutable::parse($utc, 'UTC'));
        return app(Scheduler::class)->tick();
    }

    private function occurrence(): Occurrence
    {
        return Occurrence::query()->orderByDesc('intended_at')->firstOrFail();
    }

    public function test_funding_is_saved_validated_and_defaults_to_the_account(): void
    {
        $this->assertSame('tokens', $this->routine()['funding']);
        $this->assertSame('account', $this->routine(['funding' => 'account'])['funding']);
        $plain = $this->postJson('/api/agents/v2/schedules', ['agentId' => $this->agent['id'], 'prompt' => 'x', 'timezone' => 'Europe/London',
            'recurrence' => ['type' => 'daily', 'time' => '09:00']])->assertCreated()->json('schedule');
        $this->assertSame('account', $plain['funding']);
        $this->postJson('/api/agents/v2/schedules', ['agentId' => $this->agent['id'], 'prompt' => 'x', 'timezone' => 'Europe/London',
            'recurrence' => ['type' => 'daily', 'time' => '09:00'], 'funding' => 'free'])->assertStatus(422);
    }

    public function test_a_due_token_routine_starts_one_paid_turn_in_the_teammates_conversation(): void
    {
        $s = $this->routine();
        $stats = $this->tickAt('2026-10-01 08:00:30');
        $this->assertSame(1, $stats['admitted']);
        $o = $this->occurrence();
        $this->assertSame('admitted', $o->state);
        $this->assertNull($o->run_id, 'a token routine never creates a Mac run');
        $this->assertNotNull($o->turn_id);
        $turn = DB::table('vibes_turns')->where('id', $o->turn_id)->first();
        $this->assertNotNull($turn);
        $this->assertSame(Schedule::query()->find($s['id'])->conversation_id, $turn->chat_id);
        $this->assertSame($this->user->id, (int) $turn->user_id);
        $this->assertNotSame('auto', $turn->model, 'the server routed the engine to a real model');
        $this->assertStringContainsString('scheduled routines', $turn->prompt);
        $this->assertStringContainsString('Show me my important emails.', $turn->prompt);
        Queue::assertPushed(RunVibesTurn::class, fn ($job) => $job->turnId === $o->turn_id);
        $this->assertSame($o->turn_id, $this->getJson('/api/agents/v2/schedules/'.$s['id'].'/occurrences')->json('occurrences.0.turnId'));
    }

    public function test_a_second_tick_never_starts_a_second_turn(): void
    {
        $this->routine();
        $this->tickAt('2026-10-01 08:00:30');
        $this->tickAt('2026-10-01 08:01:30');
        $this->assertSame(1, DB::table('vibes_turns')->count());
        Queue::assertPushed(RunVibesTurn::class, 1);
    }

    public function test_a_tick_that_died_after_storing_the_turn_finds_it_again(): void
    {
        $this->routine();
        $this->tickAt('2026-10-01 08:00:30');
        $o = $this->occurrence();
        $o->forceFill(['state' => 'pending', 'turn_id' => null])->save();
        $this->tickAt('2026-10-01 08:01:30');
        $this->assertSame(1, DB::table('vibes_turns')->count());
        $this->assertSame('admitted', $o->fresh()->state);
        $this->assertNotNull($o->fresh()->turn_id);
    }

    public function test_without_consent_it_fails_with_a_reason_instead_of_spending(): void
    {
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => null]);
        $this->routine();
        $this->tickAt('2026-10-01 08:00:30');
        $o = $this->occurrence();
        $this->assertSame('failed', $o->state);
        $this->assertSame('consent_required', $o->reason);
        $this->assertSame(0, DB::table('vibes_turns')->count());
    }

    public function test_a_busy_conversation_waits_and_retries_inside_the_catch_up_window(): void
    {
        $this->routine();
        $chat = Schedule::query()->firstOrFail()->conversation_id;
        DB::table('vibes_turns')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'user_id' => $this->user->id, 'chat_id' => $chat,
            'digest' => 'busy', 'model' => 'x', 'status' => 'running', 'request' => '{}', 'allocations' => '[]', 'prompt' => 'earlier', 'reserved' => 0,
            'created_at' => now(), 'updated_at' => now()]);
        $this->tickAt('2026-10-01 08:00:30');
        $this->assertSame('pending', $this->occurrence()->state, 'busy is not a failure');
        DB::table('vibes_turns')->where('status', 'running')->update(['status' => 'completed', 'settled_at' => now()]);
        $this->tickAt('2026-10-01 08:02:30');
        $this->assertSame('admitted', $this->occurrence()->state);
    }

    public function test_when_the_service_is_off_it_fails_with_a_reason(): void
    {
        config(['vibes.enabled' => false]);
        $this->routine();
        $this->tickAt('2026-10-01 08:00:30');
        $this->assertSame('tokens_unavailable', $this->occurrence()->reason);
    }

    public function test_account_routines_still_wait_for_a_mac_and_touch_no_wallet(): void
    {
        $this->routine(['funding' => 'account']);
        DB::table('agent_runtime_bindings')->update(['last_seen_at' => now()]);
        $before = app(Wallet::class)->payload($this->user->id)['available'];
        $this->tickAt('2026-10-01 08:00:30');
        $o = $this->occurrence();
        $this->assertNotNull($o->run_id);
        $this->assertNull($o->turn_id);
        $this->assertSame(0, DB::table('vibes_turns')->count());
        $this->assertSame($before, app(Wallet::class)->payload($this->user->id)['available']);
    }
}
