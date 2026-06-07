<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectMemoryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_project_memory_crud_preserves_other_app_state(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Memory User',
            'email' => 'memory@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/session/state', [
            'appState' => ['selectedChatModel' => 'gpt-5.4-mini'],
        ], $headers)->assertOk();

        $entryId = $this->postJson('/api/project-memory/project-1/entries', [
            'text' => 'Use the existing terminal route contract.',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('memory.entries.0.text', 'Use the existing terminal route contract.')
            ->json('memory.entries.0.id');

        $this->getJson('/api/project-memory/project-1', $headers)
            ->assertOk()
            ->assertJsonCount(1, 'memory.entries');

        $this->deleteJson("/api/project-memory/project-1/entries/{$entryId}", [], $headers)
            ->assertOk()
            ->assertJsonCount(0, 'memory.entries');

        $this->assertSame('gpt-5.4-mini', User::query()->first()?->app_state['selectedChatModel'] ?? null);
    }

    public function test_stale_session_state_does_not_overwrite_newer_project_memory(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Merge User',
            'email' => 'merge@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $saved = $this->postJson('/api/project-memory/project-1/entries', ['text' => 'Newest memory'], $headers)
            ->assertOk()
            ->json('memory');

        $this->postJson('/api/session/state', [
            'appState' => [
                'projectMemories' => [
                    'project-1' => ['entries' => [], 'updatedAt' => '2020-01-01T00:00:00Z'],
                ],
            ],
        ], $headers)->assertOk();

        $this->getJson('/api/project-memory/project-1', $headers)
            ->assertOk()
            ->assertJsonPath('memory.entries.0.text', 'Newest memory')
            ->assertJsonPath('memory.updatedAt', $saved['updatedAt']);
    }
}
