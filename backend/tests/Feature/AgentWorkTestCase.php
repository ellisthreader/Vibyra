<?php
namespace Tests\Feature;

use App\Models\AgentV2\Run;
use App\Services\AgentWork\{Goals, FollowUps};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

abstract class AgentWorkTestCase extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;
    protected function setUp(): void
    {
        parent::setUp(); $this->bootV2(); config(['agents_v2.work_enabled' => true, 'agents_v2.outputs_enabled' => true]);
    }
    protected function workSpec(): array
    {
        return ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'], 'title' => 'Prepare a release',
            'expiresAt' => now()->addDays(2)->toIso8601String()];
    }
    protected function goal(int $count = 2): array
    {
        $steps = [];
        foreach (range(1, $count) as $i) $steps[] = ['key' => 'step'.$i, 'title' => 'Step '.$i,
            'prompt' => 'Perform reviewed step '.$i, 'successCriteria' => 'Deliver evidence for '.$i,
            'dependsOn' => $i === 1 ? [] : ['step'.($i - 1)]];
        return app(Goals::class)->activate($this->user->id, [...$this->workSpec(), 'milestones' => $steps], 'goal-test');
    }
    protected function follow(array $condition): array
    {
        return app(FollowUps::class)->activate($this->user->id, [...$this->workSpec(), 'prompt' => 'Send me a status summary.', 'condition' => $condition], 'follow-test');
    }
    protected function completeNext(string $answer = 'Actual saved result'): array
    {
        $r = $this->claim();
        $this->postJson($this->runnerPath('/runs/'.$r['id'].'/complete'), ['generation' => $r['generation'], 'answer' => $answer], $this->runnerHeaders())->assertOk();
        $this->assertSame('completed', Run::findOrFail($r['id'])->state);
        return $r;
    }
    protected function githubTrigger(): array
    {
        $r = $this->postJson('/api/agents/v2/triggers', ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'],
            'kind' => 'github.issue', 'filter' => ['repository' => 'acme/app', 'actions' => ['opened']], 'promptTemplate' => 'Review the issue.'])->assertCreated();
        return [...$r->json('trigger'), 'secret' => $r->json('webhook.secret')];
    }
    protected function issueEvent(array $trigger, string $body = 'First', int $number = 7, bool $valid = true)
    {
        $raw = json_encode(['action' => 'opened', 'repository' => ['full_name' => 'acme/app'],
            'issue' => ['number' => $number, 'title' => 'Issue', 'body' => $body, 'user' => ['login' => 'outside'], 'labels' => []]]);
        return $this->call('POST', '/api/agents/v2/hooks/github/'.$trigger['id'], [], [], [], ['CONTENT_TYPE' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $raw, $valid ? $trigger['secret'] : 'wrong'),
            'HTTP_X_GITHUB_EVENT' => 'issues', 'HTTP_X_GITHUB_DELIVERY' => 'delivery-test-01'], $raw);
    }
}
