<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Google Drive, Google Tasks and Figma through the V2 broker (fixtures only). */
class AgentV2WorkspaceToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function start(string $provider, array $ops): \Closure
    {
        $conn = $this->providerInstall($provider, 'owner@example.com', $provider.'-token');
        $this->grant($conn, $ops);
        $this->admit('Read the plan.');
        $this->claimed = $this->claim();
        return fn ($tool, $args, $id) => $this->callTool($this->claimed, $tool, $conn, $args, $id)->assertOk();
    }

    public function test_drive_search_pages_and_read_returns_a_text_window(): void
    {
        $call = $this->start('google_drive', ['google_drive_read', 'google_drive_search']);
        $this->route('GET', '#drive/v3/files\?#', Http::response(['files' => [['id' => 'doc_1234567890', 'name' => 'Plan',
            'mimeType' => 'application/vnd.google-apps.document']], 'nextPageToken' => 'next-1']));
        $this->route('GET', '#drive/v3/files/doc_1234567890\?fields#', Http::response(['id' => 'doc_1234567890', 'name' => 'Plan',
            'mimeType' => 'application/vnd.google-apps.document', 'webViewLink' => 'https://docs.google.com/document/d/doc_1234567890']));
        $this->route('GET', '#drive/v3/files/doc_1234567890/export#', Http::response(str_repeat('a', 12000).'tail'));
        $call('google_drive_search', ['query' => 'Plan'], 'r1')->assertJsonPath('action.result.files.0.id', 'doc_1234567890')
            ->assertJsonPath('action.result.nextPageToken', 'next-1');
        $call('google_drive_read', ['id' => 'doc_1234567890'], 'r2')->assertJsonPath('action.result.nextStartChar', 12000)
            ->assertJsonPath('action.result.truncated', true)->assertJsonPath('action.receipt.providerResourceId', 'doc_1234567890');
        $call('google_drive_read', ['id' => 'doc_1234567890', 'startChar' => 12000], 'r3')->assertJsonPath('action.result.text', 'tail')
            ->assertJsonPath('action.result.nextStartChar', null);
        $this->route('GET', '#drive/v3/files/bin_1234567890\?fields#', Http::response(['id' => 'bin_1234567890', 'mimeType' => 'image/png']));
        $call('google_drive_read', ['id' => 'bin_1234567890'], 'r4')->assertJsonPath('action.result.reason', 'unsupported');
        $this->route('GET', '#drive/v3/files\?#', Http::response(['error' => ['message' => 'Insufficient Permission: insufficient scopes']], 403));
        $call('google_drive_search', ['query' => 'Plan'], 'r5')->assertJsonPath('action.result.reason', 'insufficient_scope');
    }

    public function test_tasks_create_needs_approval_and_an_unconfirmed_insert_is_unknown(): void
    {
        $call = $this->start('google_tasks', ['google_tasks_create', 'google_tasks_list', 'google_tasks_list_lists']);
        $this->route('GET', '#tasks/v1/users/@me/lists#', Http::response(['items' => [['id' => 'L1', 'title' => 'Work']]]));
        $this->route('GET', '#tasks/v1/lists/L1/tasks#', Http::response(['items' => [['id' => 't1', 'title' => 'Book room']], 'nextPageToken' => 'p2']));
        $this->route('POST', '#tasks/v1/lists/L1/tasks#', Http::response(['id' => 't9', 'title' => 'Send notes', 'due' => '2026-10-02T00:00:00.000Z']));
        $call('google_tasks_list_lists', [], 'r1')->assertJsonPath('action.result.lists.0.id', 'L1')->assertJsonPath('action.result.hasMore', false);
        $call('google_tasks_list', ['listId' => 'L1'], 'r2')->assertJsonPath('action.result.tasks.0.title', 'Book room')
            ->assertJsonPath('action.result.nextPageToken', 'p2');
        $action = $call('google_tasks_create', ['listId' => 'L1', 'title' => 'Send notes', 'due' => '2026-10-02'], 'w1')
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->decide($action)->assertJsonPath('action.state', 'completed')->assertJsonPath('action.receipt.providerResourceId', 't9');
        Http::assertSent(fn ($r) => $r->method() === 'POST' && $r['due'] === '2026-10-02T00:00:00.000Z');
        $this->route('POST', '#tasks/v1/lists/L1/tasks#', Http::response(['message' => 'boom'], 503));
        $lost = $call('google_tasks_create', ['listId' => 'L1', 'title' => 'Other'], 'w2')->json('action');
        $this->decide($lost)->assertJsonPath('action.state', 'unknown');
        $call('google_tasks_create', ['listId' => 'L1', 'title' => 'Bad', 'due' => '2026-02-31'], 'w3')
            ->assertJsonPath('action.result.reason', 'invalid_arguments');
    }

    public function test_figma_reads_name_their_file_and_type_failures(): void
    {
        $call = $this->start('figma', ['figma_read_comments', 'figma_read_file', 'figma_read_node']);
        $this->route('GET', '#api\.figma\.com/v1/files/AbCdEfGhIjKl\?#', Http::response(['name' => 'App', 'document' => [
            'id' => '0:0', 'type' => 'DOCUMENT', 'children' => [['id' => '1:2', 'name' => 'Home', 'type' => 'FRAME']]]]));
        $this->route('GET', '#files/AbCdEfGhIjKl/nodes#', Http::response(['nodes' => ['1:2' => ['document' => ['id' => '1:2',
            'name' => 'Home', 'type' => 'FRAME', 'characters' => 'Welcome']]]]));
        $call('figma_read_file', ['file' => 'https://www.figma.com/design/AbCdEfGhIjKl/App'], 'r1')
            ->assertJsonPath('action.result.node.children.0.name', 'Home');
        $call('figma_read_node', ['file' => 'AbCdEfGhIjKl', 'node' => '1-2'], 'r2')->assertJsonPath('action.result.node.text', 'Welcome')
            ->assertJsonPath('action.receipt.providerResourceId', 'AbCdEfGhIjKl/1:2');
        $call('figma_read_node', ['file' => 'AbCdEfGhIjKl'], 'r3')->assertJsonPath('action.result.reason', 'invalid_arguments');
        $this->route('GET', '#files/AbCdEfGhIjKl/comments#', Http::response(['err' => 'no'], 403));
        $call('figma_read_comments', ['file' => 'AbCdEfGhIjKl'], 'r4')->assertJsonPath('action.result.reason', 'forbidden');
        $this->route('GET', '#files/AbCdEfGhIjKl/comments#', Http::response(['err' => 'expired'], 401));
        $call('figma_read_comments', ['file' => 'AbCdEfGhIjKl'], 'r5')->assertJsonPath('action.result.outcome', 'reconnect_required');
    }
}
