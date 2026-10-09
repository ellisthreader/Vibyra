<?php
namespace Tests\Feature;
use App\Models\AgentCoordination\Workflow;
use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentCoordination\{Context, Groups, Planning, WorkflowDraft, WorkflowProgress, Workflows};
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class AgentCoordinationBoundariesTest extends AgentWorkTestCase
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
            'name' => 'Team', 'coordinatorId' => $this->agent['id'], 'members' => [
                ['agentId' => $this->agent['id'], 'handle' => 'coordinator'], ['agentId' => $this->second['id'], 'handle' => 'research']]]);
    }
    private function workflow(): Workflow
    {
        $p = app(Planning::class)->send($this->user->id, $this->group['id'], ['expectedRevision' => 1,
            'runtimeId' => $this->runtime['id'], 'expectedRuntimeRevision' => $this->runtime['revision'], 'idempotencyKey' => 'message', 'prompt' => 'Prepare report.',
            'mentions' => [$this->second['id']], 'sharedContext' => ['text' => '', 'outputs' => []]]);
        $run = Run::find($p['run']['id']);
        $spec = [...WorkflowDraft::bind($run, ['title' => 'Report', 'expiresAt' => now()->addDay()->toIso8601String(),
            'steps' => [['key' => 'one', 'agentId' => $this->second['id'], 'title' => 'Research', 'prompt' => 'Research report.',
                'successCriteria' => 'Result supported', 'dependsOn' => []]], 'finalCriteria' => 'Checked result.']),
            'agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id']];
        $w = app(Workflows::class)->activate($this->user->id, $spec, 'accepted');
        app(WorkflowProgress::class)->advance($w['id']); return Workflow::find($w['id']);
    }
    private function refuses(callable $operation, int $status = 409): void
    {
        try { $operation(); $this->fail('Operation should have been refused.'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame($status, $e->getResponse()->getStatusCode()); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame($status, $e->getStatusCode()); }
    }
    public function test_workers_cannot_read_private_outputs_files_or_expand_the_plan(): void
    {
        $w = $this->workflow(); $run = Run::find($w->steps[0]['runId']);
        foreach (['propose_work', 'delegate_task', 'read_output', 'cloud_read_file', 'cloud_write_file'] as $tool)
            $this->refuses(fn () => Context::authorizeTool($run, ['tool' => $tool, 'arguments' => []]), 403);
        $this->refuses(fn () => Context::authorizeTool($run, ['tool' => 'save_output', 'arguments' => ['id' => (string) Str::uuid()]]), 403);
        Context::authorizeTool($run, ['tool' => 'save_output', 'arguments' => ['title' => 'New result']]);
        $this->assertSame([['tool' => 'gmail_search'], ['tool' => 'save_output']], Context::filterTools($run,
            [['tool' => 'read_output'], ['tool' => 'gmail_search'], ['tool' => 'propose_work'], ['tool' => 'save_output']]));
    }
    public function test_unknown_outcome_blocks_workflow_and_cannot_be_confirmed(): void
    {
        $w = $this->workflow(); Run::whereKey($w->steps[0]['runId'])->update(['state' => 'outcome_unknown', 'finished_at' => now()]);
        app(WorkflowProgress::class)->advance($w->id); $this->assertSame('blocked', $w->fresh()->status);
        $this->refuses(fn () => app(Workflows::class)->confirm($this->user->id, $w->id, $w->fresh()->revision));
    }
    public function test_pause_records_finished_evidence_but_does_not_start_synthesis_until_resume(): void
    {
        $w = $this->workflow(); app(Workflows::class)->control($this->user->id, $w->id, $w->revision, 'pause');
        Run::whereKey($w->steps[0]['runId'])->update(['state' => 'completed', 'answer' => 'Delivered', 'finished_at' => now()]);
        app(WorkflowProgress::class)->advance($w->id); $w->refresh(); $this->assertSame('paused', $w->status); $this->assertNull($w->final_run_id);
        $resumed = app(Workflows::class)->control($this->user->id, $w->id, $w->revision, 'resume'); $this->assertNotNull($resumed['finalRunId']);
    }
    public function test_expiry_cancels_pending_runs_and_model_change_blocks_without_fallback(): void
    {
        $w = $this->workflow(); RuntimeBinding::whereKey($this->runtime['id'])->update(['model' => 'changed']);
        app(WorkflowProgress::class)->advance($w->id); $this->assertSame('blocked', $w->fresh()->status);
        $this->travel(2)->days(); app(WorkflowProgress::class)->tick(); $this->assertSame('expired', $w->fresh()->status);
        $this->assertSame('cancelled', Run::find($w->steps[0]['runId'])->state);
    }
    public function test_confirmation_rechecks_actual_evidence_and_rejects_stale_revision(): void
    {
        $w = $this->workflow(); $p = app(WorkflowProgress::class);
        Run::whereKey($w->steps[0]['runId'])->update(['state' => 'completed', 'answer' => 'Delivered', 'finished_at' => now()]); $p->advance($w->id); $w->refresh();
        Run::whereKey($w->final_run_id)->update(['state' => 'completed', 'answer' => 'Final delivered', 'finished_at' => now()]); $p->advance($w->id); $w->refresh();
        $this->refuses(fn () => app(Workflows::class)->confirm($this->user->id, $w->id, 1));
        Run::whereKey($w->steps[0]['runId'])->update(['answer' => '']);
        $this->refuses(fn () => app(Workflows::class)->confirm($this->user->id, $w->id, $w->revision)); $this->assertSame('awaiting_review', $w->fresh()->status);
    }
    public function test_profile_revision_drift_fences_already_admitted_task(): void
    {
        $w = $this->workflow(); DB::table('agent_teammates')->where('id', $this->second['id'])->increment('revision');
        $this->refuses(fn () => DB::transaction(fn () => Context::fence(RuntimeBinding::find($this->runtime['id']), $w->steps[0]['runId'])));
        app(WorkflowProgress::class)->advance($w->id); $this->assertSame('blocked', $w->fresh()->status);
    }
    public function test_full_queue_keeps_reviewed_work_pending_and_retries_without_duplicate_final_task(): void
    {
        $w = $this->workflow(); Run::whereKey($w->steps[0]['runId'])->update(['state' => 'completed', 'answer' => 'Delivered', 'finished_at' => now()]);
        $last = null;
        for ($i = 0; $i < 23; $i++) [$last] = app(\App\Services\AgentRuns\Admission::class)->admit($this->user->id, [
            'agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'], 'prompt' => 'Independent queue fixture '.$i,
            'idempotencyKey' => 'fill-'.$i, 'attachments' => []]);
        app(WorkflowProgress::class)->advance($w->id); $w->refresh();
        $this->assertSame('active', $w->status); $this->assertSame('job_queue_full', $w->reason); $this->assertNull($w->final_run_id);
        $last->forceFill(['state' => 'completed', 'answer' => 'Queue released', 'finished_at' => now()])->save();
        app(WorkflowProgress::class)->advance($w->id); $w->refresh(); $this->assertSame('synthesizing', $w->status); $this->assertNotNull($w->final_run_id);
        app(WorkflowProgress::class)->advance($w->id); $this->assertSame(1, Run::where('idempotency_key', 'workflow:'.$w->id.':synthesis:final')->count());
    }

}
