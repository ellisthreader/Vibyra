<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectMemoryVaultApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_vault_supports_folder_and_document_crud_with_versions(): void
    {
        $headers = $this->authHeaders('vault@example.com');

        $folderId = $this->postJson('/api/project-memory/project-1/nodes', [
            'type' => 'folder',
            'name' => 'Architecture',
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('node.type', 'folder')
            ->json('node.id');

        $document = $this->postJson('/api/project-memory/project-1/nodes', [
            'type' => 'document',
            'name' => 'Routes',
            'parentId' => $folderId,
            'markdown' => "# Routes\n\nUse authenticated APIs.",
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('node.parentId', $folderId)
            ->assertJsonPath('node.version', 1)
            ->json('node');

        $this->patchJson("/api/project-memory/project-1/nodes/{$document['id']}", [
            'markdown' => "# Routes\n\nUpdated.",
            'version' => 1,
        ], $headers)
            ->assertOk()
            ->assertJsonPath('node.version', 2);

        $this->patchJson("/api/project-memory/project-1/nodes/{$document['id']}", [
            'markdown' => 'Stale update',
            'version' => 1,
        ], $headers)->assertConflict();

        $this->getJson('/api/project-memory/project-1/vault', $headers)
            ->assertOk()
            ->assertJsonPath('vault.projectId', 'project-1')
            ->assertJsonCount(2, 'vault.nodes');

        $this->deleteJson("/api/project-memory/project-1/nodes/{$folderId}", [], $headers)
            ->assertConflict();
        $this->deleteJson(
            "/api/project-memory/project-1/nodes/{$folderId}",
            ['recursive' => true],
            $headers
        )->assertOk();

        $this->getJson('/api/project-memory/project-1/vault', $headers)
            ->assertOk()
            ->assertJsonCount(0, 'vault.nodes');
    }

    public function test_import_builds_folders_and_handles_collisions_without_paths(): void
    {
        $headers = $this->authHeaders('import@example.com');
        $files = [
            ['path' => 'Guides/Setup.md', 'markdown' => '# Setup', 'source' => 'obsidian_import'],
            ['path' => 'README.md', 'markdown' => '# Project'],
        ];

        $this->postJson('/api/project-memory/project-1/imports', [
            'files' => $files,
            'collisionStrategy' => 'skip',
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('imported.created', 2);

        $this->postJson('/api/project-memory/project-1/imports', [
            'manifest' => $files,
            'collisionStrategy' => 'skip',
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('imported.skipped', 2);

        $this->getJson('/api/project-memory/project-1/vault', $headers)
            ->assertOk()
            ->assertJsonCount(3, 'vault.nodes')
            ->assertJsonMissingPath('vault.nodes.0.filesystemPath');
    }

    public function test_import_rejects_path_traversal(): void
    {
        $headers = $this->authHeaders('unsafe-import@example.com');

        $this->postJson('/api/project-memory/project-1/imports', [
            'files' => [
                ['path' => '../secrets.md', 'markdown' => 'No'],
            ],
        ], $headers)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('files');
    }

    public function test_partial_state_writes_and_entry_limit_preserve_existing_data_and_brief(): void
    {
        $headers = $this->authHeaders('compat@example.com');
        $user = User::query()->firstOrFail();
        $brief = [
            'id' => 'brief-project-1',
            'text' => 'Permanent project brief',
            'source' => 'brief',
            'createdAt' => now()->subDay()->toISOString(),
        ];
        $user->forceFill([
            'app_state' => [
                'selectedChatModel' => 'gpt-5.4-mini',
                'futureClientField' => ['enabled' => true],
                'projectMemories' => [
                    'project-1' => ['entries' => [$brief], 'updatedAt' => now()->toISOString()],
                ],
            ],
        ])->save();

        $this->postJson('/api/session/state', [
            'appState' => ['theme' => 'dark'],
        ], $headers)->assertOk();

        foreach (range(1, 8) as $index) {
            $this->postJson('/api/project-memory/project-1/entries', [
                'text' => "Memory {$index}",
            ], $headers)->assertOk();
        }

        $this->getJson('/api/project-memory/project-1', $headers)
            ->assertOk()
            ->assertJsonCount(8, 'memory.entries')
            ->assertJsonFragment(['id' => 'brief-project-1', 'source' => 'brief']);

        $state = User::query()->firstOrFail()->app_state;
        $this->assertSame('gpt-5.4-mini', $state['selectedChatModel']);
        $this->assertTrue($state['futureClientField']['enabled']);
        $this->assertSame('dark', $state['theme']);
    }

    private function authHeaders(string $email): array
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Memory User',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        return ['Authorization' => "Bearer {$token}"];
    }
}
