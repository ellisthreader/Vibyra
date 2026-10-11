<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, RuntimeBinding, ToolAction};
use App\Services\AgentRuns\RunAttachments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Tests\Support\{AgentV2BrowserFixture, AgentV2Fixture, AgentV2Routes};

final class AgentBrowserUploadsTest extends \Tests\TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2BrowserFixture;
    private const BYTES = "Synthetic upload acceptance file.\n";
    private string $connection;
    private array $file;

    protected function setUp(): void
    {
        parent::setUp(); $this->bootV2(); Storage::fake('local');
    }

    private function access(bool $allowed)
    {
        return $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser', [
            'origins' => ['https://shop.example.com'], 'uploadsAllowed' => $allowed, ...$this->browserExpected()])->assertOk();
    }

    private function task(bool $uploads = true): array
    {
        $this->connection = $this->bootBrowser();
        $b = RuntimeBinding::findOrFail($this->runtime['id']);
        $b->forceFill(['capabilities' => [...$b->capabilities, 'browserUploadsV1' => true]])->save();
        if ($uploads) $this->access(true);
        $this->file = app(RunAttachments::class)->store($this->user->id, UploadedFile::fake()->createWithContent('notes.txt', self::BYTES));
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'upload-task',
            'prompt' => 'Upload the attached notes.', 'attachments' => [['id' => $this->file['id']]]])->assertCreated();
        $run = $this->claim();
        $page = $this->page(str_repeat('b', 64));
        $page['forms'][0]['enctype'] = 'multipart/form-data';
        $page['forms'][0]['fields'] = [['ref' => 'e1', 'name' => 'document', 'label' => 'Document', 'type' => 'file', 'value' => ''],
            ['name' => 'csrf', 'type' => 'hidden', 'value' => 'hidden-secret']];
        $snapshot = $this->callTool($run, 'browser_snapshot', $this->connection, [], 'snapshot')->assertOk()->json('action');
        $this->browserRun($run, $snapshot, $page)->assertOk();
        return $run;
    }

    private function upload(array $run, string $id = 'upload', array $extra = [])
    {
        return $this->callTool($run, 'browser_upload', $this->connection, [...['ref' => 'e3', 'fileRef' => 'e1',
            'fileId' => $this->file['id'], 'pageFingerprint' => str_repeat('b', 64)], ...$extra], $id)->assertOk();
    }

    private function bytes(array $run, array $action, array $extra = [])
    {
        return $this->postJson($this->browserPath($run, '/'.$action['id'].'/upload-file'), [
            'generation' => $run['generation'], 'fingerprint' => $this->fingerprintOf($action), ...$extra], $this->runnerHeaders());
    }

    public function test_uploads_are_opt_in_and_old_clients_preserve_the_current_setting(): void
    {
        $run = $this->task(false);
        $this->upload($run)->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'not_granted');
        $first = $this->browserSites(['shop.example.com'])->assertOk()->assertJsonPath('browser.uploadsAllowed', false)->json('browser');
        $enabled = $this->access(true)->assertJsonPath('browser.uploadsAllowed', true)->json('browser');
        $this->assertGreaterThan($first['generation'], $enabled['generation']);
        $this->browserSites(['shop.example.com'])->assertOk()->assertJsonPath('browser.uploadsAllowed', true);
        // An admitted task never gains the new operation retrospectively.
        $this->upload($run, 'after-enable')->assertJsonPath('action.result.reason', 'not_granted');
    }

    public function test_file_bytes_require_exact_approval_claim_fingerprint_and_unchanged_content(): void
    {
        $run = $this->task();
        $action = $this->upload($run)->assertJsonPath('action.state', 'pending_approval')->json('action');
        $args = ToolAction::findOrFail($action['id'])->arguments;
        $this->assertSame('document', $args['fileField']);
        $this->assertSame($this->file['sha256'], $args['file']['sha256']);
        $this->assertSame('[hidden]', $args['fields'][1]['value']);
        $this->bytes($run, $action)->assertStatus(409);
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'approved');
        $this->bytes($run, $action)->assertStatus(409);
        $this->browserClaim($run, $action)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $this->bytes($run, $action, ['fingerprint' => str_repeat('0', 64)])->assertStatus(409);
        $this->bytes($run, $action, ['generation' => $run['generation'] + 1])->assertStatus(409);
        $this->bytes($run, $action)->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('contentBase64', base64_encode(self::BYTES));
        $path = DB::table('agent_v2_attachments')->where('id', $this->file['id'])->value('path');
        Storage::disk('local')->put($path, 'different bytes');
        $this->bytes($run, $action)->assertStatus(409);
    }

    public function test_arbitrary_file_ids_paths_and_runtime_capability_loss_are_refused(): void
    {
        $run = $this->task();
        $other = app(RunAttachments::class)->store($this->user->id, UploadedFile::fake()->createWithContent('other.txt', 'Unselected'));
        $this->upload($run, 'unselected', ['fileId' => $other['id']])->assertJsonPath('action.result.reason', 'upload_file_unavailable');
        $this->upload($run, 'path', ['fileId' => '/etc/passwd'])->assertJsonPath('action.result.reason', 'invalid_arguments');
        $action = $this->upload($run, 'approved')->json('action');
        $this->decide($action)->assertOk(); $this->browserClaim($run, $action)->assertOk();
        $b = RuntimeBinding::findOrFail($this->runtime['id']);
        $b->forceFill(['capabilities' => [...$b->capabilities, 'browserUploadsV1' => false]])->save();
        $this->bytes($run, $action)->assertStatus(409);
        $this->upload($run, 'old-runtime')->assertJsonPath('action.result.reason', 'runtime_upgrade');
    }

    public function test_revocation_and_cancellation_stop_file_delivery_and_a_lost_receipt_stays_unknown(): void
    {
        $run = $this->task(); $action = $this->upload($run)->json('action');
        $this->decide($action)->assertOk(); $this->browserClaim($run, $action)->assertOk();
        $this->access(false); $this->bytes($run, $action)->assertStatus(409);
        $this->browserReceipt($run, $action['id'], ['unknown' => true, 'error' => 'Response lost', 'reason' => 'unavailable'])
            ->assertOk()->assertJsonPath('action.state', 'unknown')->assertJsonPath('action.result.outcome', 'outcome_unknown');
        $this->bytes($run, $action)->assertStatus(409);
    }

    public function test_success_receipt_is_bound_to_file_and_destination_and_never_records_extra_bytes(): void
    {
        $run = $this->task(); $action = $this->upload($run)->json('action');
        $this->decide($action)->assertOk(); $this->browserClaim($run, $action)->assertOk();
        $args = ToolAction::findOrFail($action['id'])->arguments;
        $this->browserReceipt($run, $action['id'], ['uploaded' => true, 'file' => $args['file'], 'url' => $args['pageUrl'],
            'pageFingerprint' => $args['pageFingerprint'], 'destination' => $args['destination'],
            'observed' => ['method' => 'POST', 'destination' => $args['destination'], 'status' => 201], 'extra' => self::BYTES])
            ->assertOk()->assertJsonPath('action.state', 'completed');
        $this->assertStringNotContainsString(self::BYTES, json_encode(ToolAction::findOrFail($action['id'])->result));
        $this->bytes($run, $action)->assertStatus(409);
    }
}
