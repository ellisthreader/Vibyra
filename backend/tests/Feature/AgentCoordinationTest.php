<?php
namespace Tests\Feature;
use App\Models\AgentCoordination\{Message, Workflow};
use App\Models\AgentV2\Run;
use App\Services\AgentCoordination\{Context, Groups, Planning, WorkflowDraft, WorkflowProgress, WorkflowSpecs, Workflows};
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;
final class AgentCoordinationTest extends AgentWorkTestCase
{
    use \Tests\Support\AgentCoordinationFixture;
    private array $group;
    private array $second;
    protected function setUp(): void
    {
        parent::setUp(); $this->coordinationRuntime();
        $this->second = app(Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => 'Research',
            'brief' => 'Research carefully.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        $this->group = app(Groups::class)->save($this->user->id, (string) Str::uuid(), ['expectedRevision' => 0,
            'name' => 'Release team', 'coordinatorId' => $this->agent['id'], 'members' => [
                ['agentId' => $this->agent['id'], 'handle' => 'coordinator'], ['agentId' => $this->second['id'], 'handle' => 'research']]]);
    }
    private function planning(array $mentions = []): array
    {
        return app(Planning::class)->send($this->user->id, $this->group['id'], ['expectedRevision' => 1,
            'runtimeId' => $this->runtime['id'], 'expectedRuntimeRevision' => $this->runtime['revision'], 'idempotencyKey' => 'planning-1', 'prompt' => 'Prepare a release report.',
            'mentions' => $mentions, 'sharedContext' => ['text' => 'Only the selected release.', 'outputs' => []]]);
    }
    private function spec(Run $run): array
    {
        return [...WorkflowDraft::bind($run, ['title' => 'Release report', 'expiresAt' => now()->addDay()->toIso8601String(),
            'steps' => [
                ['key' => 'a', 'agentId' => $this->agent['id'], 'title' => 'Review', 'prompt' => 'Review release.', 'successCriteria' => 'Review delivered', 'dependsOn' => []],
                ['key' => 'b', 'agentId' => $this->second['id'], 'title' => 'Research', 'prompt' => 'Research release.', 'successCriteria' => 'Research delivered', 'dependsOn' => []],
                ['key' => 'c', 'agentId' => $this->second['id'], 'title' => 'Combine', 'prompt' => 'Compare results.', 'successCriteria' => 'Comparison delivered', 'dependsOn' => ['a', 'b']]],
            'finalCriteria' => 'Deliver a report supported by the actual results.']), 'agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id']];
    }
    private function workflow(): Workflow
    {
        $p = $this->planning(); $run = Run::find($p['run']['id']);
        $w = app(Workflows::class)->activate($this->user->id, $this->spec($run), 'accepted-1');
        return Workflow::find($w['id']);
    }
    private function delivered(string $id, string $answer = 'Verified result'): void
    {
        Run::whereKey($id)->update(['state' => 'completed', 'answer' => $answer, 'finished_at' => now()]);
    }
    public function test_planning_is_isolated_idempotent_and_does_not_admit_worker_tasks(): void
    {
        $first = $this->planning(); $second = $this->planning();
        $this->assertSame($first['run']['id'], $second['run']['id']); $this->assertDatabaseCount('agent_runs', 1);
        $this->assertDatabaseCount('agent_workflows', 0); $run = Run::find($first['run']['id']);
        $this->assertTrue(Context::isolated($run)); $this->assertSame('planning', Context::metadata($run)['role']);
        $this->assertSame([['tool' => 'propose_work']], Context::filterTools($run, [['tool' => 'gmail_search'], ['tool' => 'propose_work'], ['tool' => 'read_output']]));
        Http::assertNothingSent();
    }
    public function test_dag_independent_roots_dependencies_synthesis_and_owner_confirmation(): void
    {
        $w = $this->workflow(); $p = app(WorkflowProgress::class); $p->advance($w->id); $p->advance($w->id); $w->refresh();
        $this->assertNotNull($w->steps[0]['runId']); $this->assertNotNull($w->steps[1]['runId']); $this->assertNull($w->steps[2]['runId']);
        $this->assertDatabaseCount('agent_runs', 3);
        $this->delivered($w->steps[0]['runId'], 'Review evidence'); $p->advance($w->id); $this->assertNull($w->fresh()->steps[2]['runId']);
        $this->delivered($w->steps[1]['runId'], 'Research evidence'); $p->advance($w->id); $w->refresh();
        $third = Run::find($w->steps[2]['runId']); $this->assertStringContainsString('Review evidence', $third->prompt);
        $this->assertStringContainsString('Research evidence', $third->prompt);
        $this->delivered($third->id); $p->advance($w->id); $w->refresh(); $this->assertSame('synthesizing', $w->status);
        $this->delivered($w->final_run_id, 'Coordinator checked report'); $p->advance($w->id); $w->refresh();
        $this->assertSame('awaiting_review', $w->status);
        $result = app(Workflows::class)->confirm($this->user->id, $w->id, $w->revision); $this->assertSame('completed', $result['status']);
        $p->advance($w->id); $this->assertDatabaseCount('agent_runs', 5); Http::assertNothingSent();
    }
    public function test_failure_blocks_dependents_and_cancels_unfinished_sibling(): void
    {
        $w = $this->workflow(); app(WorkflowProgress::class)->advance($w->id); $w->refresh();
        Run::whereKey($w->steps[0]['runId'])->update(['state' => 'failed', 'finished_at' => now()]);
        app(WorkflowProgress::class)->advance($w->id); $w->refresh();
        $this->assertSame('blocked', $w->status); $this->assertNull($w->steps[2]['runId']);
        $this->assertSame('cancelled', Run::find($w->steps[1]['runId'])->state);
    }
    public function test_group_revision_change_blocks_queued_work_and_cancels_it(): void
    {
        $w = $this->workflow(); app(WorkflowProgress::class)->advance($w->id);
        DB::table('agent_groups')->where('id', $this->group['id'])->increment('revision');
        app(WorkflowProgress::class)->advance($w->id); $this->assertSame('blocked', $w->fresh()->status);
        foreach ($w->fresh()->steps as $s) if ($s['runId']) $this->assertSame('cancelled', Run::find($s['runId'])->state);
    }
    public function test_cycles_and_model_injected_context_are_rejected(): void
    {
        $p = $this->planning(); $run = Run::find($p['run']['id']); $s = $this->spec($run); $s['steps'][0]['dependsOn'] = ['c'];
        try { WorkflowSpecs::normalize($s); $this->fail('A cycle was accepted'); } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        try { WorkflowDraft::bind($run, ['groupId' => $this->group['id']]); $this->fail('Model context accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
    }
}
