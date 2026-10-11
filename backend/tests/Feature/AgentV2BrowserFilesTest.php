<?php
namespace Tests\Feature;
use App\Models\AgentV2\{BrowserFile, RuntimeBinding};
use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2BrowserFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;
class AgentV2BrowserFilesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2BrowserFixture;
    protected function setUp(): void { parent::setUp(); $this->bootV2(); }
    private function downloadTask(bool $claim = true): array
    {
        $connection = $this->bootBrowser();
        $binding = RuntimeBinding::findOrFail($this->runtime['id']);
        $binding->forceFill(['capabilities' => [...$binding->capabilities, 'browserWorkflowsV1' => true]])->save();
        $this->admit('Download the synthetic invoice.'); $run = $this->claim();
        $action = $this->callTool($run, 'browser_download', $connection,
            ['url' => 'https://shop.example.com/invoice?month=october'], 'file-1')->assertOk()->json('action');
        if ($claim) $this->browserClaim($run, $action)->assertOk()->assertJsonPath('action.state', 'dispatching');
        return [$run, $action];
    }
    private function file(array $run, array $action, string $bytes = "item,amount\nfixture,12\n"): array
    {
        return ['generation' => $run['generation'], 'actionId' => $action['id'], 'name' => 'invoice.csv',
            'mimeType' => 'text/csv', 'contentBase64' => base64_encode($bytes), 'sha256' => hash('sha256', $bytes)];
    }
    public function test_new_tools_refuse_direct_calls_after_current_runtime_capability_is_removed(): void
    {
        [$run, $action] = $this->downloadTask(false);
        $model = \App\Models\AgentV2\Run::findOrFail($run['id']);
        $binding = RuntimeBinding::findOrFail($this->runtime['id']);
        $binding->forceFill(['capabilities' => [...$binding->capabilities, 'browserWorkflowsV1' => false]])->save();
        $connection = \App\Models\AgentV2\Connection::findOrFail(\App\Models\AgentV2\ToolAction::findOrFail($action['id'])->connection_id);
        $this->callTool($run, 'browser_download', $connection->id, ['url' => 'https://shop.example.com/invoice'], 'after-upgrade')
            ->assertOk()->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'runtime_upgrade');
        try {
            app(\App\Services\AgentRuns\Browser\BrowserBinding::class)->bind($model, $connection, 'browser_download', ['url' => 'https://shop.example.com/invoice']);
            $this->fail('Direct binding must enforce the current capability too.');
        } catch (\App\Services\AgentRuns\Tools\ToolRefused $error) {
            $this->assertSame('browser_workflows_unavailable', $error->reason);
        }
    }
    public function test_exact_claimed_download_is_encrypted_idempotent_owned_and_metadata_only(): void
    {
        [$run, $action] = $this->downloadTask(); $body = $this->file($run, $action);
        $path = $this->browserPath($run, '/files');
        $file = $this->postJson($path, $body, $this->runnerHeaders())->assertOk()->json('file');
        $this->postJson($path, $body, $this->runnerHeaders())->assertOk()->assertJsonPath('file.id', $file['id']);
        $this->assertDatabaseCount('agent_browser_files', 1);
        $stored = DB::table('agent_browser_files')->first();
        $this->assertStringNotContainsString('fixture', $stored->content);
        $this->assertNotSame($body['contentBase64'], $stored->content);
        $this->assertSame('https://shop.example.com', $file['sourceOrigin']);
        $this->browserReceipt($run, $action['id'], ['url' => 'https://shop.example.com/invoice', 'file' => $file])
            ->assertOk()->assertJsonPath('action.result.file.id', $file['id']);
        $this->assertStringNotContainsString($body['contentBase64'], DB::table('agent_tool_actions')->where('id', $action['id'])->value('result'));
        $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser/files')->assertOk()->assertJsonCount(1, 'files');
        $this->get('/api/agents/v2/browser/files/'.$file['id'].'/download')->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')->assertSee('fixture,12');
        $this->postJson($path, $this->file($run, $action, 'different'), $this->runnerHeaders())->assertStatus(409);
    }
    public function test_unclaimed_stale_generation_and_forged_receipt_are_refused(): void
    {
        [$run, $action] = $this->downloadTask(false); $body = $this->file($run, $action);
        $this->postJson($this->browserPath($run, '/files'), $body, $this->runnerHeaders())->assertStatus(409);
        $this->browserClaim($run, $action)->assertOk();
        $this->postJson($this->browserPath($run, '/files'), [...$body, 'generation' => $run['generation']+1], $this->runnerHeaders())->assertStatus(409);
        $this->browserReceipt($run, $action['id'], ['url' => 'https://shop.example.com', 'file' => ['id' => 'fake', 'sha256' => $body['sha256']]])->assertStatus(422);
        $this->assertDatabaseCount('agent_browser_files', 0);
    }
    public function test_cancellation_preserves_only_already_claimed_factual_download(): void
    {
        [$run, $action] = $this->downloadTask();
        $this->postJson('/api/agents/v2/runs/'.$run['id'].'/cancel')->assertOk();
        $file = $this->postJson($this->browserPath($run, '/files'), $this->file($run, $action), $this->runnerHeaders())->assertOk()->json('file');
        $this->browserReceipt($run, $action['id'], ['url' => 'https://shop.example.com', 'file' => $file])->assertOk();
        $this->assertDatabaseHas('agent_runs', ['id' => $run['id'], 'state' => 'cancelled']);
    }
    public function test_content_mismatch_active_html_and_excess_size_do_not_create_files(): void
    {
        [$run, $action] = $this->downloadTask(); $body = $this->file($run, $action);
        foreach ([['sha256' => str_repeat('a',64)], ['mimeType' => 'text/html'],
            ['contentBase64' => base64_encode('<script>unsafe</script>'), 'sha256' => hash('sha256','<script>unsafe</script>')],
            ['name' => '../invoice.csv']] as $bad)
            $this->postJson($this->browserPath($run, '/files'), [...$body, ...$bad], $this->runnerHeaders())->assertStatus(422);
        $this->postJson($this->browserPath($run, '/files'), [...$body, 'contentBase64' => str_repeat('A', 4*(int)ceil((8*1024*1024)/3)+4)], $this->runnerHeaders())->assertStatus(422);
        $this->assertDatabaseCount('agent_browser_files', 0);
    }
    public function test_incomplete_form_cannot_be_approved_and_semantic_selectors_cannot_execute_code(): void
    {
        [$run, $download] = $this->downloadTask();
        $conn = DB::table('agent_tool_actions')->where('id', $download['id'])->value('connection_id');
        $fp = str_repeat('d', 64); $snap = $this->callTool($run, 'browser_snapshot', $conn, [], 'form')->assertOk()->json('action');
        $page = $this->page($fp); $page['forms'][0]['fieldsComplete'] = false;
        $this->browserRun($run, $snap, $page)->assertOk();
        $this->callTool($run, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'incomplete')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'incomplete_form');
        $this->callTool($run, 'browser_resolve', $conn, ['origin' => 'https://shop.example.com', 'path' => '/contact',
            'role' => 'button', 'name' => 'Send', 'script' => 'unsafe'], 'script')->assertOk()->assertJsonPath('action.state', 'refused');
        $this->callTool($run, 'browser_resolve', $conn, ['origin' => 'https://shop.example.com', 'path' => '/contact',
            'role' => 'textbox', 'name' => 'Password'], 'private')->assertOk()->assertJsonPath('action.state', 'refused');
    }
    public function test_other_account_cannot_list_or_download_and_run_removal_cascades(): void
    {
        [$run, $action] = $this->downloadTask();
        $file = $this->postJson($this->browserPath($run, '/files'), $this->file($run, $action), $this->runnerHeaders())->assertOk()->json('file');
        $other = User::factory()->create(); config(['agents_v2.user_ids' => $this->user->id.','.$other->id]);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256','other-browser-user'), 'device_name'=>'fixture']);
        $this->withToken('other-browser-user');
        $this->getJson('/api/agents/v2/browser/files/'.$file['id'].'/download')->assertNotFound();
        $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser/files')->assertNotFound();
        DB::table('agent_runs')->where('id', $run['id'])->delete();
        $this->assertDatabaseCount('agent_browser_files', 0);
    }
}
