<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** F-13 (security review 2026-09-30): a runner cannot grow one run's journal or action rows without bound. */
class AgentV2JournalCapTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function types(string $runId): array
    {
        return array_count_values(DB::table('agent_run_events')->where('run_id', $runId)->orderBy('seq')->pluck('type')->all());
    }

    public function test_runner_chatter_stops_at_the_cap_with_one_marker_and_the_answer_still_lands(): void
    {
        config(['agents_v2.max_journal_events' => 30]);
        $run = $this->admit();
        $claimed = $this->claim();
        for ($batch = 0; $batch < 6; $batch++)
            $this->postJson($this->runnerPath('/runs/'.$run['id'].'/events'), ['generation' => $claimed['generation'],
                'events' => array_map(fn ($i) => ['type' => $i % 2 ? 'status' : 'message.delta', 'text' => "chunk $batch-$i"], range(0, 9))],
                $this->runnerHeaders())->assertOk();
        $types = $this->types($run['id']);
        $this->assertLessThanOrEqual(31, DB::table('agent_run_events')->where('run_id', $run['id'])->count(), 'Sixty posted events stopped at the cap, plus the marker.');
        $this->assertSame(1, $types['journal.truncated'] ?? 0, 'One marker says events were dropped.');
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => 'All done.'],
            $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'completed');
        $types = $this->types($run['id']);
        $this->assertSame([1, 1], [$types['message.final'] ?? 0, $types['run.completed'] ?? 0], 'The answer and the ending are never dropped.');
        $this->assertLessThan(60, DB::table('agent_run_events')->where('run_id', $run['id'])->count());
    }

    public function test_refused_calls_are_bounded_and_still_answered(): void
    {
        config(['agents_v2.max_refused_calls' => 5]);
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_read']); // gmail_search is not granted: every call below is refused
        $run = $this->admit('Search.');
        $claimed = $this->claim();
        foreach (range(1, 12) as $i)
            $this->callTool($claimed, 'gmail_search', $connection, ['query' => 'x'], 'r'.$i)->assertOk()
                ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'not_granted');
        $this->assertSame(5, DB::table('agent_tool_actions')->where('run_id', $run['id'])->where('state', 'refused')->count());
        $types = $this->types($run['id']);
        $this->assertSame([5, 1], [$types['tool.refused'] ?? 0, $types['journal.truncated'] ?? 0]);
        $this->assertSame(0, DB::table('agent_runs')->where('id', $run['id'])->value('tool_calls'));
        // A repeat of a refusal that was kept is still an idempotent replay of the same answer.
        $this->callTool($claimed, 'gmail_search', $connection, ['query' => 'x'], 'r1')->assertOk()->assertJsonPath('action.state', 'refused');
    }
}
