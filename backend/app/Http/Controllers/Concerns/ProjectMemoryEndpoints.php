<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\ProjectMemory\ProjectMemoryImportService;
use App\Services\ProjectMemory\ProjectMemoryVaultService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

trait ProjectMemoryEndpoints
{
    public function projectMemory(Request $request, string $projectId): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return $this->json($this->projectMemoryPayload($projectId, $user->app_state['projectMemories'][$projectId] ?? []));
    }

    public function addProjectMemory(Request $request, string $projectId): JsonResponse
    {
        $text = $this->normalizeProjectMemoryText($request->input('text'));
        if ($text === '') {
            return $this->json(['ok' => false, 'error' => 'Enter a memory before saving.'], 422);
        }

        $userId = $this->authenticatedUser($request)->id;
        $memory = DB::transaction(function () use ($userId, $projectId, $text) {
            $user = User::query()->lockForUpdate()->findOrFail($userId);
            $state = is_array($user->app_state) ? $user->app_state : [];
            $memories = is_array($state['projectMemories'] ?? null) ? $state['projectMemories'] : [];
            $memory = $this->normalizeProjectMemory($memories[$projectId] ?? []);
            $duplicate = collect($memory['entries'])->contains(
                fn ($entry) => mb_strtolower($entry['text']) === mb_strtolower($text)
            );
            if (! $duplicate) {
                $memory['entries'][] = [
                    'id' => 'user-'.Str::lower(Str::random(14)),
                    'text' => $text,
                    'source' => 'user',
                    'createdAt' => now()->toISOString(),
                ];
                $memory['entries'] = $this->limitProjectMemoryEntries($memory['entries']);
            }
            $memory['updatedAt'] = now()->toISOString();
            $memories[$projectId] = $memory;
            $state['projectMemories'] = $memories;
            $user->forceFill(['app_state' => $state])->save();

            return $memory;
        });

        return $this->json($this->projectMemoryPayload($projectId, $memory));
    }

    public function projectMemoryVault(Request $request, string $projectId): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return $this->json(app(ProjectMemoryVaultService::class)->payload($user, $projectId));
    }

    public function createProjectMemoryNode(Request $request, string $projectId): JsonResponse
    {
        $attributes = $request->validate([
            'type' => ['required', 'in:folder,document'],
            'name' => ['required', 'string', 'max:255'],
            'parentId' => ['nullable', 'string', 'max:26'],
            'markdown' => ['nullable', 'string'],
        ]);
        $node = app(ProjectMemoryVaultService::class)->createNode(
            $this->authenticatedUser($request),
            $projectId,
            $attributes
        );

        return $this->json(['ok' => true, 'node' => $node], 201);
    }

    public function updateProjectMemoryNode(
        Request $request,
        string $projectId,
        string $nodeId
    ): JsonResponse {
        $attributes = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'parentId' => ['sometimes', 'nullable', 'string', 'max:26'],
            'markdown' => ['sometimes', 'nullable', 'string'],
            'version' => ['sometimes', 'integer', 'min:1'],
        ]);
        if (count($attributes) === (array_key_exists('version', $attributes) ? 1 : 0)) {
            throw ValidationException::withMessages(['node' => 'Provide a memory change.']);
        }
        $node = app(ProjectMemoryVaultService::class)->updateNode(
            $this->authenticatedUser($request),
            $projectId,
            $nodeId,
            $attributes
        );

        return $this->json(['ok' => true, 'node' => $node]);
    }

    public function deleteProjectMemoryNode(
        Request $request,
        string $projectId,
        string $nodeId
    ): JsonResponse {
        $result = app(ProjectMemoryVaultService::class)->deleteNode(
            $this->authenticatedUser($request),
            $projectId,
            $nodeId,
            $request->boolean('recursive')
        );

        return $this->json($result);
    }

    public function importProjectMemory(Request $request, string $projectId): JsonResponse
    {
        $strategy = (string) $request->input('collisionStrategy', 'skip');
        if (! in_array($strategy, ['skip', 'replace', 'keep_both'], true)) {
            throw ValidationException::withMessages([
                'collisionStrategy' => 'Use skip, replace, or keep_both.',
            ]);
        }
        $files = $request->input('files', $request->input('manifest', []));
        if (! is_array($files)) {
            throw ValidationException::withMessages(['files' => 'Provide a Markdown manifest.']);
        }
        $result = app(ProjectMemoryImportService::class)->import(
            $this->authenticatedUser($request),
            $projectId,
            $files,
            $strategy
        );

        return $this->json($result, 201);
    }

    public function deleteProjectMemory(Request $request, string $projectId, string $entryId): JsonResponse
    {
        $userId = $this->authenticatedUser($request)->id;
        $memory = DB::transaction(function () use ($userId, $projectId, $entryId) {
            $user = User::query()->lockForUpdate()->findOrFail($userId);
            $state = is_array($user->app_state) ? $user->app_state : [];
            $memories = is_array($state['projectMemories'] ?? null) ? $state['projectMemories'] : [];
            $memory = $this->normalizeProjectMemory($memories[$projectId] ?? []);
            $memory['entries'] = array_values(array_filter(
                $memory['entries'],
                fn ($entry) => $entry['id'] !== $entryId || $entry['source'] === 'brief'
            ));
            $memory['updatedAt'] = now()->toISOString();
            $memories[$projectId] = $memory;
            $state['projectMemories'] = $memories;
            $user->forceFill(['app_state' => $state])->save();

            return $memory;
        });

        return $this->json($this->projectMemoryPayload($projectId, $memory));
    }

    private function mergeProjectMemoriesState(array $incoming, array $existing): array
    {
        $merged = $existing;
        foreach ($incoming as $projectId => $memory) {
            $next = $this->normalizeProjectMemory($memory);
            $current = $this->normalizeProjectMemory($existing[$projectId] ?? []);
            $merged[$projectId] = strcmp($next['updatedAt'], $current['updatedAt']) >= 0 ? $next : $current;
        }

        return $merged;
    }

    private function normalizeProjectMemory(mixed $value): array
    {
        $value = is_array($value) ? $value : [];
        $entries = [];
        foreach ((array) ($value['entries'] ?? []) as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $id = trim((string) ($entry['id'] ?? ''));
            $text = $this->normalizeProjectMemoryText($entry['text'] ?? '');
            if ($id === '' || $text === '') {
                continue;
            }
            $entries[] = [
                'id' => mb_substr($id, 0, 120),
                'text' => $text,
                'source' => ($entry['source'] ?? '') === 'brief' ? 'brief' : 'user',
                'createdAt' => (string) ($entry['createdAt'] ?? now()->toISOString()),
            ];
        }

        return [
            'entries' => $this->limitProjectMemoryEntries($entries),
            'updatedAt' => (string) ($value['updatedAt'] ?? ($entries[count($entries) - 1]['createdAt'] ?? '')),
        ];
    }

    private function normalizeProjectMemoryText(mixed $value): string
    {
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) $value)), 0, 220);
    }

    private function projectMemoryPayload(string $projectId, mixed $memory): array
    {
        return ['ok' => true, 'projectId' => $projectId, 'memory' => $this->normalizeProjectMemory($memory)];
    }

    private function limitProjectMemoryEntries(array $entries): array
    {
        $briefs = array_values(array_filter($entries, fn ($entry) => $entry['source'] === 'brief'));
        $userEntries = array_values(array_filter($entries, fn ($entry) => $entry['source'] !== 'brief'));
        $briefs = array_slice($briefs, 0, 8);
        $remaining = 8 - count($briefs);

        return array_values(array_merge(
            $briefs,
            $remaining > 0 ? array_slice($userEntries, -$remaining) : []
        ));
    }
}
