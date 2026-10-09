<?php
namespace Tests\Feature;
use App\Models\AgentCoordination\Message;
use App\Models\AgentV2\Run;
use App\Services\AgentCoordination\{Groups, Planning, SharedContext, WorkflowDraft};
use App\Services\AgentRuns\Outputs\Outputs;
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class AgentCoordinationContextTest extends AgentWorkTestCase
{
    use \Tests\Support\AgentCoordinationFixture;
    private function group(): array
    {
        $this->coordinationRuntime();
        $other = app(Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => 'Research',
            'brief' => 'Research.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        return app(Groups::class)->save($this->user->id, (string) Str::uuid(), ['expectedRevision' => 0,
            'name' => 'Team', 'coordinatorId' => $this->agent['id'], 'members' => [
                ['agentId' => $this->agent['id'], 'handle' => 'coordinator'], ['agentId' => $other['id'], 'handle' => 'research']]]);
    }
    public function test_explicit_output_revision_is_copied_immutably_without_ordinary_history_or_unselected_outputs(): void
    {
        $ordinary = $this->admit('Unselected private conversation'); $r = Run::find($ordinary['id']);
        $args = ['kind' => 'checklist', 'title' => 'Selected version', 'content' => ['items' => [['id' => 'a', 'text' => 'Version one', 'checked' => false]]]];
        $output = DB::transaction(fn () => app(Outputs::class)->save($r, $args));
        DB::transaction(fn () => app(Outputs::class)->save($r, [...$args, 'title' => 'Private unselected output']));
        $g = $this->group();
        $p = app(Planning::class)->send($this->user->id, $g['id'], ['expectedRevision' => 1, 'runtimeId' => $this->runtime['id'], 'expectedRuntimeRevision' => $this->runtime['revision'],
            'idempotencyKey' => 'selected-context', 'prompt' => 'Review the selected version.', 'mentions' => [],
            'sharedContext' => ['text' => 'Explicit note', 'outputs' => [['id' => $output->id, 'revision' => 1]]]]);
        app(Outputs::class)->edit($this->user->id, $output->id, ['revision' => 1, 'title' => 'Changed title',
            'content' => ['items' => [['id' => 'a', 'text' => 'Version two', 'checked' => true]]]]);
        $m = Message::find($p['message']['id']); $run = Run::find($m->planning_run_id);
        $this->assertSame('Version one', $m->shared_context['outputs'][0]['content']['items'][0]['text']);
        $this->assertStringContainsString('Version one', $run->prompt); $this->assertStringNotContainsString('Version two', $run->prompt);
        $this->assertStringNotContainsString('Private unselected output', $run->prompt);
        $this->assertStringNotContainsString('Unselected private conversation', $run->prompt);
        $context = WorkflowDraft::reviewContext($run); $this->assertSame('Selected version', $context['sharedContext']['outputs'][0]['title']);
        $this->assertArrayNotHasKey('content', $context['sharedContext']['outputs'][0]);
        $this->assertStringNotContainsString('Version one', DB::table('agent_group_messages')->where('id', $m->id)->value('shared_context'));
    }
    public function test_unowned_or_nonexistent_output_revision_is_rejected(): void
    {
        try { SharedContext::capture($this->user->id, ['text' => '', 'outputs' => [['id' => (string) Str::uuid(), 'revision' => 1]]]); $this->fail('Unavailable version accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(404, $e->getStatusCode()); }
    }
    public function test_group_save_replays_exact_body_and_rejects_stale_changed_body(): void
    {
        $g = $this->group(); $d = ['expectedRevision' => 0, 'name' => $g['name'], 'coordinatorId' => $g['coordinatorId'],
            'members' => array_map(fn ($m) => ['agentId' => $m['agentId'], 'handle' => $m['handle']], $g['members'])];
        $this->assertSame(1, app(Groups::class)->save($this->user->id, $g['id'], $d)['revision']);
        try { app(Groups::class)->save($this->user->id, $g['id'], [...$d, 'name' => 'Changed']); $this->fail('Stale save accepted'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame(409, $e->getResponse()->getStatusCode()); }
        $d['members'][1]['agentId'] = (string) Str::uuid(); $d['expectedRevision'] = 1;
        try { app(Groups::class)->save($this->user->id, $g['id'], $d); $this->fail('Foreign member accepted'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame(409, $e->getResponse()->getStatusCode()); }
    }
}
