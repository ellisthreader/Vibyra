<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue};
use Tests\Support\{AgentV2Fixture, AgentV2Routes, TriggerHooks};
use Tests\TestCase;

/** Part 4 loop guard on GitHub (own login dropped, one run per issue, cap holds) and the "from <source>" notification title. */
class AgentV2TriggerLoopGuardTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, TriggerHooks;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function trigger(array $filter = [], array $extra = []): array
    {
        return $this->makeTrigger('github.issue', ['repository' => 'acme/app', 'actions' => ['opened', 'labeled'], ...$filter], $extra);
    }

    public function test_an_issue_the_connected_github_account_wrote_does_not_retrigger(): void
    {
        $this->providerInstall('github', '@Vibyra-Bot', 'ghp-token');
        $t = $this->trigger();
        $this->github($t, $this->githubIssue('opened', 7, 'vibyra-bot'), 'dlv-own-0001')->assertStatus(202)->assertJsonPath('state', 'skipped');
        $this->assertSame('own_activity', DB::table('agent_trigger_events')->sole()->reason);
        $this->assertSame(0, DB::table('agent_runs')->count());
        // A human labelling the bot's issue is not the bot's own activity; the number is a new subject.
        $this->github($t, [...$this->githubIssue('labeled', 8, 'octocat'), 'issue' => [...$this->githubIssue('labeled', 8, 'octocat')['issue'],
            'user' => ['login' => 'vibyra-bot']]], 'dlv-own-0002')->assertJsonPath('state', 'admitted');
        $opt = $this->trigger(['includeOwn' => true]);
        $this->github($opt, $this->githubIssue('opened', 9, 'vibyra-bot'), 'dlv-own-0003')->assertJsonPath('state', 'admitted');
        $this->assertSame(2, DB::table('agent_runs')->count());
    }

    public function test_a_burst_on_one_issue_admits_one_run_and_the_cap_still_holds(): void
    {
        $t = $this->trigger([], ['ratePerHour' => 3]);
        foreach (['opened', 'labeled', 'labeled', 'labeled'] as $i => $action)
            $this->github($t, [...$this->githubIssue($action, 7), 'issue' => [...$this->githubIssue($action, 7)['issue'], 'body' => 'Edit '.$i]], 'dlv-burst-000'.$i)->assertStatus(202);
        $this->assertSame(1, DB::table('agent_runs')->count());
        $this->assertSame(3, DB::table('agent_trigger_events')->where('reason', 'subject_busy')->count());
        foreach ([8, 9, 10, 11] as $n) $this->github($t, $this->githubIssue('opened', $n), 'dlv-cap-00'.$n)->assertStatus(202);
        $this->assertSame(3, DB::table('agent_runs')->count(), 'ratePerHour=3 counts admitted runs; skipped bursts do not use it up.');
        $this->assertSame(2, DB::table('agent_trigger_events')->where('reason', 'rate_limited')->count());
    }

    public function test_the_subject_window_ends_and_a_finished_run_frees_the_issue(): void
    {
        $t = $this->trigger();
        $this->github($t, $this->githubIssue('opened', 7), 'dlv-win-0001')->assertJsonPath('state', 'admitted');
        $this->github($t, $this->githubIssue('labeled', 7), 'dlv-win-0002')->assertJsonPath('state', 'skipped');
        $this->travel(61)->minutes();
        DB::table('agent_runtime_bindings')->update(['last_seen_at' => now()]);
        $this->github($t, [...$this->githubIssue('labeled', 7), 'note' => 'later'], 'dlv-win-0003')->assertJsonPath('state', 'admitted'); // window over: never stuck behind a stranded run
        DB::table('agent_runs')->update(['state' => 'completed']);
        $this->github($t, [...$this->githubIssue('labeled', 7), 'issue' => [...$this->githubIssue('labeled', 7)['issue'], 'body' => 'x']], 'dlv-win-0004')
            ->assertJsonPath('state', 'admitted');
        $this->assertSame(3, DB::table('agent_runs')->count());
    }

    public function test_a_trigger_started_run_says_where_it_came_from_in_its_notifications(): void
    {
        Queue::fake();
        config(['agents_v2.notifications' => true, 'intelligence.inbox' => true, 'intelligence.push' => false]);
        $t = $this->makeTrigger('linear.issue', [], ['signingSecret' => self::LINEAR_SECRET]);
        $this->linear($t, $this->linearIssue())->assertJsonPath('state', 'admitted');
        $manual = $this->admit('Do a manual thing.');
        $run = DB::table('agent_runs')->where('idempotency_key', 'like', 'trg:%')->first();
        foreach ([$run->id, $manual['id']] as $id)
            app(\App\Services\AgentRuns\Events::class)->append(\App\Models\AgentV2\Run::query()->findOrFail($id), 'run.completed', ['answer' => 'ok']);
        $titles = DB::table('notification_items')->orderBy('created_at')->pluck('title', 'destination')->mapWithKeys(
            fn ($title, $dest) => [json_decode($dest, true)['runId'] => [$title, json_decode($dest, true)['from'] ?? null]]);
        $this->assertSame(['Inbox finished · from Linear', 'linear'], $titles[$run->id]);
        $this->assertSame(['Inbox finished', null], $titles[$manual['id']]);
    }
}
