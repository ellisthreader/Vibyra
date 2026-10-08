<?php
namespace Tests\Feature\SpendCaps;

use App\Jobs\RunVibesTurn;
use App\Services\Progress\TurnObservation;
use App\Services\Vibes\{AgentTools, Turns};
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;

/** A run that reaches a cap between steps pauses; it does not fail, and the person can raise the cap and go on. */
class SpendCapsRunTest extends SpendCapsTestCase
{
    /** Submit a tool-using turn, run its first model step (cost 0.012 USD) and answer the tool call. */
    private function turnAfterOneStep(): string
    {
        $id = (string) Str::uuid();
        $q = $this->quote(500_000, $this->chat());
        $q['request'] = ['model' => 'qwen/qwen3.8-flash', 'messages' => [['role' => 'user', 'content' => 'Read hello.txt']],
            'tools' => AgentTools::definitions(), 'max_tokens' => 2048, 'provider' => ['max_price' => ['prompt' => 0.15, 'completion' => 0.47]]];
        app(Turns::class)->submit($this->user->id, $id, $q);
        Http::fakeSequence()->push(['id' => 'gen-one', 'usage' => ['cost' => 0.012], 'choices' => [['message' => [
            'role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call-one', 'type' => 'function',
                'function' => ['name' => 'read_file', 'arguments' => '{"path":"hello.txt"}']]]]]]])
            ->push(['id' => 'gen-two', 'usage' => ['cost' => 0.001], 'choices' => [['message' => ['content' => 'Done.']]]]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $tool = DB::table('vibes_tools')->where('turn_id', $id)->first();
        app(AgentTools::class)->respond($this->user->id, $tool->id, 'allow', ['content' => 'hello', 'sha256' => hash('sha256', 'hello')]);
        return $id;
    }

    public function test_a_run_that_reaches_the_daily_cap_pauses_and_resumes_after_a_raise(): void
    {
        $this->caps(day: 50);
        $id = $this->turnAfterOneStep();
        $this->caps(day: 1); // the person lowers it between steps
        app()->call([new RunVibesTurn($id), 'handle']);
        $turn = DB::table('vibes_turns')->where('id', $id)->first();
        $this->assertSame(['completed', 'spend_cap', null], [$turn->status, $turn->finish_reason, $turn->error], 'paused, not failed');
        $this->assertSame(12_000, (int) $turn->actual_micro_usd, 'what was spent is kept');
        $this->assertStringContainsString('Paused by your spending limit', $turn->response);
        $this->assertSame('paused_by_limits', app(TurnObservation::class)->read($turn)['phase']);
        Http::assertSentCount(1);
        $this->assertSame([0, 12_000], [(int) $this->row()->held, (int) $this->row()->spent]);
        // Still at the cap: a new message is refused. Raised for today: it goes through.
        $this->assertSame(429, $this->submitStatus());
        $this->postJson('/api/vibes/spend-caps/raise', ['cap' => 'day'])->assertOk()->assertJsonPath('spendCaps.day.limit', 2);
        $this->assertSame(202, $this->submitStatus());
    }

    public function test_a_per_task_limit_pauses_the_run_once_it_has_spent_that_much_and_alerts_once(): void
    {
        $this->caps(run: 1);
        $id = $this->turnAfterOneStep();
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'completed', 'finish_reason' => 'spend_cap']);
        app()->call([new RunVibesTurn($id), 'handle']); // a duplicate job changes nothing
        $this->assertSame(1, DB::table('work_events')->where('phase', 'spend_run')->count());
        $this->assertSame('run', json_decode(DB::table('work_events')->value('metadata'), true)['kind']);
    }

    public function test_a_generous_reservation_does_not_pause_a_run_that_has_spent_little(): void
    {
        $this->caps(day: 50); // the reservation alone is 50 tokens; only 1.2 have been spent
        $id = $this->turnAfterOneStep();
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'completed', 'response' => 'Done.', 'finish_reason' => 'response_ready']);
    }

    private function submitStatus(): int
    {
        $quote = \Illuminate\Support\Facades\Crypt::encryptString(json_encode($this->quote(100_000, $this->chat())));
        return $this->postJson('/api/vibes/turns', ['id' => (string) Str::uuid(), 'quote' => $quote])->getStatusCode();
    }
}
