<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Output, Run};
use App\Services\AgentRuns\Outputs\Outputs;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

final class AgentStageTwoOutputsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['agents_v2.outputs_enabled' => true]);
    }

    private function start(): array { $this->admit('Make a launch checklist.'); return $this->claim(); }

    private function checklist(): array
    {
        return ['kind' => 'checklist', 'title' => 'Launch', 'content' => ['items' => [
            ['id' => 'review', 'text' => 'Review the draft', 'checked' => false]]]];
    }

    private function save(array $run, array $args, string $call = 'save-1')
    {
        return $this->callTool($run, 'save_output', $run['id'], $args, $call);
    }

    public function test_model_creates_reopens_revises_same_output_and_duplicate_call_does_not_create_again(): void
    {
        $run = $this->start();
        $tools = array_column($run['tools']['tools'], 'tool');
        $this->assertContains('save_output', $tools);
        $this->assertContains('read_output', $tools);
        $this->assertLessThanOrEqual(10, count($tools));
        $output = $this->save($run, $this->checklist())->assertOk()->json('action.result.output');
        $this->save($run, $this->checklist())->assertOk()->assertJsonPath('action.result.output.id', $output['id']);
        $this->assertDatabaseCount('agent_outputs', 1);
        $this->callTool($run, 'read_output', $run['id'], ['id' => $output['id']], 'read-1')->assertOk()
            ->assertJsonPath('action.result.output.revision', 1);
        $this->callTool($run, 'read_output', $run['id'], [], 'list-1')->assertOk()
            ->assertJsonPath('action.result.outputs.0.id', $output['id']);
        $args = [...$this->checklist(), 'id' => $output['id'], 'revision' => 1];
        $args['content']['items'][0]['checked'] = true;
        $this->save($run, $args, 'save-2')->assertOk()->assertJsonPath('action.result.output.revision', 2);
        $this->save($run, $args, 'save-3')->assertStatus(409)->assertJsonPath('code', 'stale_output');
        $this->assertDatabaseCount('agent_outputs', 1);
        $this->assertDatabaseCount('agent_output_revisions', 2);
        $this->assertSame(1, count(app(Outputs::class)->forRun(Run::findOrFail($run['id']))));
        Http::assertNothingSent();
    }

    public function test_owner_can_toggle_reopen_and_export_with_stale_edit_rejected(): void
    {
        $run = $this->start();
        $output = $this->save($run, $this->checklist())->assertOk()->json('action.result.output');
        $this->getJson('/api/agents/v2/teammates/'.$this->agent['id'].'/outputs')->assertOk()
            ->assertJsonPath('outputs.0.id', $output['id']);
        $path = '/api/agents/v2/outputs/'.$output['id'];
        $this->getJson($path)->assertOk()->assertJsonPath('output.revision', 1);
        $etag = $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk()->headers->get('ETag');
        $args = ['revision' => 1, 'title' => 'Reviewed launch', 'content' => $output['content']];
        $args['content']['items'][0]['checked'] = true;
        $this->patchJson($path, $args)->assertOk()->assertJsonPath('output.revision', 2);
        $this->patchJson($path, $args)->assertStatus(409)->assertJsonPath('code', 'stale_output');
        $this->getJson('/api/agents/v2/runs/'.$run['id'], ['If-None-Match' => $etag])->assertOk()
            ->assertJsonPath('run.outputs.0.revision', 2);
        $markdown = $this->getJson($path.'/export')->assertOk()->json('export');
        $this->assertSame('text/markdown', $markdown['contentType']);
        $this->assertStringContainsString('- [x] Review the draft', $markdown['content']);
        $this->assertStringContainsString($run['id'], $markdown['content']);
        $json = $this->getJson($path.'/export?format=json')->assertOk()->json('export');
        $this->assertSame(2, json_decode($json['content'], true)['revision']);
    }

    public function test_forged_sources_unknown_fields_and_nondata_content_are_rejected(): void
    {
        $run = $this->start();
        $this->save($run, [...$this->checklist(), 'sourceActionIds' => [(string) \Illuminate\Support\Str::uuid()]])->assertStatus(422);
        $this->save($run, [...$this->checklist(), 'content' => ['script' => 'fetch("https://evil")']])->assertStatus(422);
        $this->save($run, [...$this->checklist(), 'kind' => 'html'])->assertStatus(422);
        $this->save($run, ['kind' => 'table', 'title' => 'Bad', 'content' => ['columns' => ['One'], 'rows' => [['a', 'b']]]])->assertStatus(422);
        $this->save($run, [...$this->checklist(), 'content' => ['items' => [
            ['id' => 'same', 'text' => 'A', 'checked' => false], ['id' => 'same', 'text' => 'B', 'checked' => false]]]])->assertStatus(422);
        $this->save($run, [...$this->checklist(), 'sourceActionIds' => ['not-a-uuid']])->assertStatus(422);
        $this->save($run, [...$this->checklist(), 'id' => 'not-a-uuid', 'revision' => 1])->assertStatus(422);
        $this->callTool($run, 'read_output', $run['id'], ['id' => 'not-a-uuid'], 'bad-id')->assertStatus(422);
        $this->assertDatabaseCount('agent_outputs', 0);
    }

    public function test_foreign_owner_or_teammate_cannot_read_or_modify_output(): void
    {
        $run = $this->start();
        $output = $this->save($run, $this->checklist())->assertOk()->json('action.result.output');
        $other = \App\Models\User::factory()->create();
        Output::query()->whereKey($output['id'])->update(['user_id' => $other->id]);
        $this->getJson('/api/agents/v2/outputs/'.$output['id'])->assertNotFound();
        $this->callTool($run, 'read_output', $run['id'], ['id' => $output['id']], 'foreign')->assertNotFound();
        $this->save($run, [...$this->checklist(), 'id' => $output['id'], 'revision' => 1], 'foreign-write')->assertNotFound();
        $this->getJson('/api/agents/v2/outputs/'.$output['id'].'/export')->assertNotFound();
    }

    public function test_output_tools_are_fenced_and_never_authorize_external_actions(): void
    {
        $run = $this->start();
        $this->callTool($run, 'save_output', (string) \Illuminate\Support\Str::uuid(), $this->checklist(), 'wrong-scope')
            ->assertStatus(403)->assertJsonPath('code', 'wrong_output_scope');
        $stale = [...$run, 'generation' => $run['generation'] + 1];
        $this->save($stale, $this->checklist())->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->callTool($run, 'gmail_send', $run['id'], ['to' => 'a@example.com', 'subject' => 'x', 'body' => 'x'], 'send')
            ->assertOk()->assertJsonPath('action.state', 'refused');
        config(['agents_v2.outputs_enabled' => false]);
        $this->save($run, $this->checklist())->assertStatus(503);
        Http::assertNothingSent();
    }
}
