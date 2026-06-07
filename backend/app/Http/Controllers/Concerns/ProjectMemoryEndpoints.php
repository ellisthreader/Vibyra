<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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
                $memory['entries'] = array_slice($memory['entries'], -8);
            }
            $memory['updatedAt'] = now()->toISOString();
            $memories[$projectId] = $memory;
            $state['projectMemories'] = $memories;
            $user->forceFill(['app_state' => $state])->save();

            return $memory;
        });

        return $this->json($this->projectMemoryPayload($projectId, $memory));
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
            'entries' => array_slice($entries, -8),
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
}
