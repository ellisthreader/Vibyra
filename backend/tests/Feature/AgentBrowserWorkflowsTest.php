<?php
namespace Tests\Feature;
use App\Models\AgentV2\Run;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{AgentV2BrowserFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;
class AgentBrowserWorkflowsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2BrowserFixture;
    private string $connection;
    protected function setUp(): void
    {
        parent::setUp(); $this->bootV2(); $this->connection = $this->bootBrowser();
        config(['agents_v2.browser_workflows_enabled' => true, 'agents_v2.parallel_jobs_enabled' => true]);
        $this->runtime = $this->postJson('/api/agents/v2/runtimes', ['hostId' => $this->hostId, 'provider' => 'claude',
            'accountRef' => 'default', 'model' => 'claude-sonnet', 'capabilities' => ['controlledTools' => true,
                'pinnedSkillsV1' => true, 'browserTools' => true, 'browserWorkflowsV1' => true, 'parallelJobsV1' => true, 'workerSlots' => 3]])
            ->assertCreated()->json('runtime');
    }
    protected function claim(): array
    {
        return $this->postJson($this->runnerPath('/claim'), ['workerSlot' => 0], $this->runnerHeaders())->assertOk()->json('run');
    }
    private function draft(): array
    {
        $source = $this->admit('Open the browser to teach.');
        $this->postJson('/api/agents/v2/runs/'.$source['id'].'/cancel')->assertOk();
        return $this->postJson('/api/agents/v2/browser-workflows', ['id' => (string) Str::uuid(), 'sourceRunId' => $source['id'],
            'name' => 'Test contact entry', 'steps' => [['operation' => 'type', 'parameter' => 'input1',
                'target' => ['origin' => 'https://shop.example.com', 'path' => '/contact', 'role' => 'textbox', 'name' => 'To', 'inputType' => 'email']]]])
            ->assertCreated()->json('workflow');
    }
    private function review(array $w): array { return ['expectedRevision' => $w['revision'], 'reviewHash' => $w['reviewHash']]; }
    private function start(array $w): array
    {
        return $this->postJson('/api/agents/v2/browser-workflows/'.$w['id'].'/test', [...$this->review($w),
            'requestId' => (string) Str::uuid(), 'inputs' => ['input1' => 'fresh@example.com']])->assertOk()->json();
    }
    public function test_only_verified_exact_steps_can_pass_and_save_an_assigned_version(): void
    {
        $w = $this->draft(); $path = '/api/agents/v2/browser-workflows/'.$w['id'];
        $this->postJson($path.'/save', $this->review($w))->assertStatus(409);
        $test = $this->start($w); $run = $this->claim(); $this->assertSame($test['runId'], $run['id']);
        $this->assertSame([], $run['history']);
        $serialized = json_encode($run); $this->assertStringNotContainsString('Summarize mail.', $serialized);
        $this->assertStringNotContainsString('save_output', json_encode($run['tools']));
        $fp = str_repeat('b', 64);
        $open = $this->callTool($run, 'browser_open', $this->connection, ['url' => 'https://shop.example.com/contact'], 'open')->assertOk()->json('action');
        $this->browserRun($run, $open, $this->page($fp))->assertOk();
        $this->callTool($run, 'browser_type', $this->connection, ['ref' => 'e1', 'text' => 'fresh@example.com'], 'skip-resolve')->assertStatus(409);
        $resolve = $this->callTool($run, 'browser_resolve', $this->connection, $w['steps'][0]['target'], 'resolve')->assertOk()->json('action');
        $this->browserRun($run, $resolve, [...$this->page($fp), 'resolvedRef' => 'e1'])->assertOk();
        $this->callTool($run, 'browser_type', $this->connection, ['ref' => 'e2', 'text' => 'fresh@example.com'], 'wrong')->assertStatus(409);
        $type = $this->callTool($run, 'browser_type', $this->connection, ['ref' => 'e1', 'text' => 'fresh@example.com'], 'type')->assertOk()->json('action');
        $this->browserRun($run, $type, $this->page($fp, 'fresh@example.com'))->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $run['generation'], 'answer' => 'Finished test.'], $this->runnerHeaders())->assertOk();
        $this->getJson($path)->assertOk()->assertJsonPath('workflow.testState', 'passed');
        $before = DB::table('agent_teammates')->where('id', $this->agent['id'])->value('revision');
        $saved = $this->postJson($path.'/save', $this->review($w))->assertOk()->json();
        $this->assertNotEmpty($saved['workflow']['skillId']); $this->assertSame([$this->agent['id']], $saved['skill']['teammateIds']);
        $this->assertGreaterThan($before, DB::table('agent_teammates')->where('id', $this->agent['id'])->value('revision'));
        $this->postJson($path.'/save', $this->review($w))->assertOk()->assertJsonPath('workflow.skillId', $saved['workflow']['skillId']);
        $this->assertDatabaseCount('agent_skills', 1);
    }
    public function test_model_completion_alone_cannot_pass_and_stale_review_does_not_save(): void
    {
        $w = $this->draft(); $this->start($w); $run = $this->claim();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $run['generation'], 'answer' => 'I did everything.'], $this->runnerHeaders())->assertOk();
        $path = '/api/agents/v2/browser-workflows/'.$w['id'];
        $this->getJson($path)->assertOk()->assertJsonPath('workflow.testState', 'failed');
        $this->postJson($path.'/save', $this->review($w))->assertStatus(409);
        $this->putJson($path, ['expectedRevision' => 1, 'name' => 'Changed', 'steps' => $w['steps']])->assertOk()->assertJsonPath('workflow.revision', 2);
        $this->postJson($path.'/test', [...$this->review($w), 'requestId' => (string) Str::uuid(), 'inputs' => ['input1' => 'x']])->assertStatus(409);
    }
    public function test_arbitrary_code_secret_fields_and_cross_origin_targets_are_refused(): void
    {
        $w = $this->draft(); $path = '/api/agents/v2/browser-workflows/'.$w['id'];
        foreach ([['name' => 'Password'], ['origin' => 'https://evil.example.com'], ['path' => '/contact?token=secret'], ['selector' => '#send']] as $bad) {
            $steps = $w['steps']; $steps[0]['target'] = [...$steps[0]['target'], ...$bad];
            $this->putJson($path, ['expectedRevision' => 1, 'name' => $w['name'], 'steps' => $steps])->assertStatus(422);
        }
        $this->postJson($path.'/test', [...$this->review($w), 'requestId' => (string) Str::uuid(), 'inputs' => ['input1' => 'ghp_'.str_repeat('a', 36)]])->assertStatus(422);
        $this->assertDatabaseCount('agent_browser_workflow_tests', 0);
    }
}
