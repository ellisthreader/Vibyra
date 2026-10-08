<?php

namespace Tests\Feature;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\CloudFiles\{Files, FileScope};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Storage};
use Illuminate\Support\Str;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

final class AgentStageThreeFilesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;
    private string $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['agents_v2.cloud_enabled' => true]);
        $this->workspace = (string) Str::uuid();
        DB::table('cloud_workspaces')->insert(['id' => $this->workspace, 'user_id' => $this->user->id,
            'name' => 'Private test computer', 'project_id' => 'test', 'app_name' => 'test-'.Str::random(12), 'state' => 'ready']);
    }

    private function task(): array
    {
        $this->admit('Save my private research note.');
        $run = $this->claim();
        $row = Run::findOrFail($run['id']);
        $row->forceFill(['runtime_snapshot' => [...$row->runtime_snapshot,
            'executionTarget' => 'cloud', 'cloudWorkspaceId' => $this->workspace]])->save();
        return $run;
    }

    private function save(array $run, int $revision = 0, string $content = 'Test note', string $call = 'write-1')
    {
        return $this->callTool($run, 'cloud_write_file', $run['id'],
            ['path' => 'research/note.md', 'revision' => $revision, 'content' => $content], $call);
    }

    public function test_file_survives_new_task_with_exact_bytes_history_and_idempotent_save(): void
    {
        $run = $this->task();
        $this->save($run)->assertOk()->assertJsonPath('action.result.file.revision', 1);
        $this->save($run)->assertOk()->assertJsonPath('action.result.file.revision', 1);
        $this->assertDatabaseCount('agent_cloud_file_versions', 1);
        $this->assertNotSame('Test note', DB::table('agent_cloud_file_versions')->value('content'));
        $this->save($run, 1, 'Changed note', 'write-2')->assertOk()->assertJsonPath('action.result.file.revision', 2);
        $this->save($run, 1, 'Stale edit', 'write-3')->assertStatus(409)->assertJsonPath('code', 'cloud_file_changed');
        // A replacement process has no in-memory or VM filesystem state to rely on.
        $fresh = Run::findOrFail($run['id'])->replicate();
        $fresh->id = (string) Str::uuid();
        $fresh->idempotency_key = 'replacement-'.Str::random(10);
        $fresh->conversation_seq++;
        $fresh->save();
        $files = new Files;
        $latest = $files->read($fresh, ['path' => 'research/note.md'])['file'];
        $this->assertSame('Changed note', $latest['content']);
        $this->assertSame(hash('sha256', 'Changed note'), $latest['sha256']);
        $this->assertSame('Test note', $files->read($fresh, ['path' => 'research/note.md', 'revision' => 1])['file']['content']);
        $this->assertCount(1, $files->read($fresh, [])['files']);
        Http::assertNothingSent();
    }

    public function test_private_scope_cannot_be_chosen_through_tool_arguments_or_other_account(): void
    {
        $run = $this->task();
        $this->save($run)->assertOk();
        $this->callTool($run, 'cloud_read_file', $run['id'], ['path' => 'research/note.md', 'agentId' => 'other'], 'forged')->assertStatus(422);
        $this->callTool($run, 'cloud_read_file', (string) Str::uuid(), [], 'wrong')->assertStatus(403);
        $row = Run::findOrFail($run['id']);
        $row->forceFill(['runtime_snapshot' => [...$row->runtime_snapshot, 'accountRef' => 'another-account']])->save();
        $this->callTool($run, 'cloud_read_file', $run['id'], [], 'list-other')->assertStatus(409);
        $this->assertSame([], app(Files::class)->read($row, [])['files']);
    }

    public function test_unsafe_paths_oversize_data_and_stale_lease_cannot_write(): void
    {
        $run = $this->task();
        foreach (['../secret.txt', '/etc/a.txt', '.env', 'a//b.txt', 'a/../b.txt', 'a/.token.txt', 'a\\b.txt', 'a.js', 'a/ b.txt'] as $i => $path)
            $this->callTool($run, 'cloud_write_file', $run['id'], ['path' => $path, 'revision' => 0, 'content' => 'bad'], 'path-'.$i)->assertStatus(422);
        $this->save($run, 0, str_repeat('x', Files::FILE_BYTES + 1))->assertStatus(422);
        $this->save([...$run, 'generation' => $run['generation'] + 1])->assertStatus(409);
        $this->assertDatabaseCount('agent_cloud_files', 0);
        config(['agents_v2.cloud_enabled' => false]);
        $this->save($run)->assertStatus(403);
    }

    public function test_http_file_limit_accepts_exact_64_kib_and_rejects_larger_content(): void
    {
        $run = $this->task();
        $content = str_repeat("\t", Files::FILE_BYTES); // JSON escaping must not shrink the documented byte allowance.
        $this->save($run, 0, $content, 'maximum')->assertOk()->assertJsonPath('action.result.file.bytes', Files::FILE_BYTES);
        $this->callTool($run, 'cloud_read_file', $run['id'], ['path' => 'research/note.md'], 'read-maximum')
            ->assertOk()->assertJsonPath('action.result.file.content', $content);
        $this->save($run, 1, $content.'x', 'too-large')->assertStatus(422);
        $this->assertDatabaseCount('agent_cloud_file_versions', 1);
        $this->callTool($run, 'cloud_read_file', $run['id'], ['path' => str_repeat('x', 16001)], 'other-limit')
            ->assertStatus(422)->assertJsonPath('code', 'arguments_too_large');
    }

    public function test_revision_quota_checks_include_all_saved_versions_and_rollback_failed_writes(): void
    {
        $run = $this->task();
        $this->save($run)->assertOk();
        DB::table('agent_cloud_file_scopes')->update(['stored_bytes' => Files::TOTAL_BYTES - 1]);
        $this->save($run, 1, 'Two bytes', 'quota')->assertStatus(422);
        $this->assertSame(1, (int) DB::table('agent_cloud_files')->value('revision'));
        $this->assertDatabaseCount('agent_cloud_file_versions', 1);
        DB::table('agent_cloud_file_scopes')->update(['file_count' => Files::MAX_FILES, 'stored_bytes' => 9]);
        $this->callTool($run, 'cloud_write_file', $run['id'], ['path' => 'extra.txt', 'content' => 'x', 'revision' => 0], 'full')->assertStatus(422);
        $this->assertDatabaseCount('agent_cloud_files', 1);
    }

    public function test_workspace_owner_and_account_scope_are_authoritative(): void
    {
        $run = $this->task();
        $this->save($run)->assertOk();
        $other = \App\Models\User::factory()->create();
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['user_id' => $other->id]);
        $this->callTool($run, 'cloud_read_file', $run['id'], [], 'foreign-owner')->assertNotFound();
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['user_id' => $this->user->id]);
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['state' => 'deleted']);
        $this->callTool($run, 'cloud_read_file', $run['id'], [], 'deleted')->assertNotFound();
        $local = Run::findOrFail($run['id']);
        $local->forceFill(['runtime_snapshot' => [...$local->runtime_snapshot, 'executionTarget' => 'local']])->save();
        $this->callTool($run, 'cloud_read_file', $run['id'], [], 'local')->assertStatus(403);
    }

    public function test_another_teammate_on_same_computer_and_account_cannot_read_private_files(): void
    {
        $run = $this->task();
        $this->save($run)->assertOk();
        $other = app(\App\Services\Agents\Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(),
            'name' => 'Other', 'brief' => 'Help.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        Run::whereKey($run['id'])->update(['agent_id' => $other['id']]);
        $this->callTool($run, 'cloud_read_file', $run['id'], [], 'other-list')->assertOk()->assertJsonPath('action.result.files', []);
        $this->callTool($run, 'cloud_read_file', $run['id'], ['path' => 'research/note.md'], 'other-read')->assertNotFound();
        $this->assertDatabaseCount('agent_cloud_files', 1);
    }

    public function test_history_has_no_plaintext_copy_and_redacted_read_hash_matches_returned_bytes(): void
    {
        $run = $this->task();
        config(['agent_depth.secret_guard' => true]);
        $text = 'Private note: sk-ant-api03-'.str_repeat('a', 100);
        $this->save($run, 0, $text)->assertOk();
        $read = $this->callTool($run, 'cloud_read_file', $run['id'], ['path' => 'research/note.md'], 'read')
            ->assertOk()->json('action.result.file');
        $this->assertTrue($read['redacted']);
        $this->assertSame(hash('sha256', $read['content']), $read['sha256']);
        $this->assertSame(strlen($read['content']), $read['bytes']);
        $this->assertSame(hash('sha256', $text), $read['storedSha256']);
        foreach (DB::table('agent_tool_actions')->where('run_id', $run['id'])->get() as $action) {
            $this->assertArrayNotHasKey('content', json_decode($action->arguments, true));
            $this->assertArrayNotHasKey('content', json_decode($action->result, true)['file']);
            $this->assertStringNotContainsString($text, $action->arguments.$action->result);
        }
    }

    public function test_cloud_deletion_purges_versions_without_affecting_another_workspace(): void
    {
        $run = $this->task();
        $this->save($run)->assertOk();
        $otherId = (string) Str::uuid();
        DB::table('cloud_workspaces')->insert(['id' => $otherId, 'user_id' => $this->user->id,
            'name' => 'Other', 'project_id' => 'other', 'app_name' => 'other-'.Str::random(12), 'state' => 'stopped']);
        $otherRun = Run::findOrFail($run['id']);
        $otherRun->runtime_snapshot = [...$otherRun->runtime_snapshot, 'cloudWorkspaceId' => $otherId];
        DB::transaction(fn () => app(Files::class)->write($otherRun, ['path' => 'retained.md', 'content' => 'Keep me', 'revision' => 0]));
        Storage::fake('local');
        config(['cloud_workspaces.disk' => 'local']);
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['state' => 'stopped']);
        app(\App\Services\CloudWorkspaces\Deletion::class)->delete(DB::table('cloud_workspaces')->find($this->workspace));
        $this->assertDatabaseCount('agent_cloud_files', 1);
        $this->assertDatabaseCount('agent_cloud_file_versions', 1);
        $this->assertDatabaseCount('agent_cloud_file_scopes', 1);
        $this->assertSame('Keep me', app(Files::class)->read($otherRun, ['path' => 'retained.md'])['file']['content']);
    }
}
