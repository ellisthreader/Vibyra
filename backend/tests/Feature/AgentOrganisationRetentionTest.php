<?php
namespace Tests\Feature;
use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentOrganizations\Retention;
use App\Services\AgentRuns\{Canonical, Runs, Outputs\Outputs};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentOrganisationFixture;
use Tests\TestCase;
final class AgentOrganisationRetentionTest extends TestCase
{
    use RefreshDatabase, AgentOrganisationFixture;
    protected function setUp(): void { parent::setUp(); $this->bootOrganisation(); config(['agents_v2.outputs_enabled' => true]); }
    private function oldRun(): Run
    {
        $run = Run::findOrFail($this->admit('A confidential request')['id']);
        $run->forceFill(['state' => 'completed', 'answer' => 'A confidential answer', 'finished_at' => now()->subDays(100)])->save();
        return $run;
    }
    public function test_retention_clears_only_expired_org_task_content_and_preserves_authority_and_new_output_revision(): void
    {
        $old = $this->oldRun(); $tag = Runs::etag($old);
        $output = app(Outputs::class)->save($old, ['kind' => 'text', 'title' => 'Old report', 'content' => ['text' => 'old secret']]);
        $current = Run::findOrFail($this->admit('Current request')['id']);
        app(Outputs::class)->save($current, ['id' => $output->id, 'revision' => 1, 'title' => 'Current report', 'content' => ['text' => 'current text']]);
        \App\Models\AgentV2\Job::findOrFail($current->id)->forceFill(['context' => ['history' => [
            ['runId' => $old->id, 'prompt' => $old->prompt, 'answer' => $old->answer]], 'memory' => 'Private memory']])->save();
        $personal = DB::table('agent_teammates')->where('id', '!=', $this->agent['id'])->where('user_id', $this->user->id)->first();
        [$kept] = app(\App\Services\AgentRuns\Admission::class)->admit($this->user->id, ['agentId' => $personal->id,
            'idempotencyKey' => 'personal-old-run', 'prompt' => 'Personal history', 'runtimeId' => $this->runtime['id']]);
        $kept->forceFill(['state' => 'completed', 'finished_at' => now()->subYears(2)])->save();
        $this->assertSame(1, Retention::prune()); $this->assertSame(0, Retention::prune());
        $this->assertSame('', $old->refresh()->prompt); $this->assertNull($old->answer);
        $this->assertNotSame($tag, Runs::etag($old));
        $this->assertSame('Personal history', $kept->refresh()->prompt);
        $this->assertSame('Current request', $current->refresh()->prompt);
        $this->assertSame(['text' => 'current text'], $output->refresh()->content);
        $this->assertSame([], \App\Models\AgentV2\Job::findOrFail($current->id)->context['history']);
        $this->assertSame(1, DB::table('agent_output_revisions')->where('output_id', $output->id)->count());
        $this->assertSame(2, DB::table('agent_organisation_runs')->count());
        $this->assertNotNull(DB::table('agent_organisation_runs')->where('run_id', $old->id)->value('content_cleared_at'));
    }
    public function test_unknown_effect_never_loses_its_reconciliation_content(): void
    {
        $old = $this->oldRun();
        ToolAction::create(['run_id' => $old->id, 'user_id' => $this->user->id, 'call_id' => 'unknown-send', 'tool' => 'gmail_send',
            'kind' => 'write', 'connection_id' => (string) \Illuminate\Support\Str::uuid(), 'connection_generation' => 1,
            'grant_id' => (string) \Illuminate\Support\Str::uuid(), 'grant_revision' => 1, 'schema_revision' => '1',
            'arguments' => ['to' => 'fixture@example.com'], 'args_hash' => Canonical::hash([]), 'state' => 'unknown']);
        $this->assertSame(0, Retention::prune());
        $this->assertSame('A confidential request', $old->refresh()->prompt);
    }
    public function test_terminal_outputs_and_proposals_do_not_keep_hidden_content(): void
    {
        $old = $this->oldRun();
        $output = app(Outputs::class)->save($old, ['kind' => 'text', 'title' => 'Secret report', 'content' => ['text' => 'secret body']]);
        config(['agents_v2.work_enabled' => true]);
        $proposal = app(\App\Services\AgentWork\Proposals\Proposals::class)->create($old, 'skill',
            ['name' => 'Private procedure', 'instructions' => 'Private instructions', 'assignToAgent' => false]);
        $this->assertSame(1, Retention::prune());
        $this->assertSame('Removed by organisation retention', $output->refresh()->title);
        $this->assertSame(0, DB::table('agent_output_revisions')->where('output_id', $output->id)->count());
        $this->assertSame('discarded', $proposal->refresh()->status);
        $this->assertStringNotContainsString('Private instructions', json_encode($proposal->spec));
    }
}
