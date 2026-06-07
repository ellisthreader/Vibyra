<?php

namespace App\Services\ProjectMemory;

use App\Models\ProjectMemoryNode;
use App\Models\ProjectMemoryVault;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProjectMemoryImportService
{
    private const MAX_FILES = 500;

    private const MAX_TOTAL_BYTES = 10485760;

    public function __construct(private readonly ProjectMemoryVaultService $vaults) {}

    public function import(User $user, string $projectId, array $manifest, string $strategy): array
    {
        $this->assertManifest($manifest);

        return DB::transaction(function () use ($user, $projectId, $manifest, $strategy) {
            $vault = $this->vaults->lockedVault($user, $projectId);
            $summary = ['created' => 0, 'replaced' => 0, 'skipped' => 0];
            $folders = [];

            foreach ($manifest as $file) {
                $segments = $this->pathSegments((string) $file['path']);
                $fileName = array_pop($segments);
                $parent = $this->ensureFolders($vault, $segments, $folders);
                $name = preg_replace('/\.md$/i', '', $fileName) ?: 'Untitled';
                $existing = $vault->nodes()
                    ->where('parent_id', $parent?->id)
                    ->where('name', $name)
                    ->first();

                if ($existing && $strategy === 'skip') {
                    $summary['skipped']++;

                    continue;
                }
                if ($existing && $strategy === 'replace' && $existing->type === 'document') {
                    $existing->forceFill([
                        'markdown_content' => (string) $file['markdown'],
                        'source' => (string) ($file['source'] ?? 'markdown_import'),
                        'source_path' => (string) $file['path'],
                        'version' => $existing->version + 1,
                    ])->save();
                    $summary['replaced']++;

                    continue;
                }
                if ($existing) {
                    $name = $this->availableName($vault, $parent?->id, $name);
                }

                $vault->nodes()->create([
                    'parent_id' => $parent?->id,
                    'type' => 'document',
                    'name' => $name,
                    'markdown_content' => (string) $file['markdown'],
                    'source' => (string) ($file['source'] ?? 'markdown_import'),
                    'source_path' => (string) $file['path'],
                    'position' => $this->vaults->nextPosition($vault, $parent?->id),
                    'version' => 1,
                ]);
                $summary['created']++;
            }

            if ($summary['created'] + $summary['replaced'] > 0) {
                $this->vaults->bumpRevision($vault);
            }

            return [
                'ok' => true,
                'imported' => $summary,
                'revision' => $vault->revision,
            ];
        });
    }

    private function assertManifest(array $manifest): void
    {
        if ($manifest === [] || count($manifest) > self::MAX_FILES) {
            throw ValidationException::withMessages([
                'files' => 'Import between 1 and '.self::MAX_FILES.' Markdown files.',
            ]);
        }

        $total = 0;
        foreach ($manifest as $index => $file) {
            if (! is_array($file)) {
                throw ValidationException::withMessages(["files.{$index}" => 'Each file must be an object.']);
            }
            $path = (string) ($file['path'] ?? '');
            $markdown = (string) ($file['markdown'] ?? '');
            $this->pathSegments($path);
            if (! preg_match('/\.md$/i', $path)) {
                throw ValidationException::withMessages(["files.{$index}.path" => 'Only .md files can be imported.']);
            }
            if (! in_array(($file['source'] ?? 'markdown_import'), ['markdown_import', 'obsidian_import'], true)) {
                throw ValidationException::withMessages(["files.{$index}.source" => 'Choose a valid import source.']);
            }
            if (strlen($markdown) > ProjectMemoryVaultService::MAX_MARKDOWN_BYTES) {
                throw ValidationException::withMessages(["files.{$index}.markdown" => 'Markdown files cannot exceed 500 KB.']);
            }
            $total += strlen($markdown);
        }
        if ($total > self::MAX_TOTAL_BYTES) {
            throw ValidationException::withMessages(['files' => 'The import cannot exceed 10 MB.']);
        }
    }

    private function pathSegments(string $path): array
    {
        $path = str_replace('\\', '/', trim($path));
        $segments = array_values(array_filter(explode('/', $path), fn ($part) => $part !== ''));
        if (
            $path === ''
            || str_starts_with($path, '/')
            || count($segments) > 32
            || collect($segments)->contains(fn ($part) => mb_strlen($part) > 255)
            || collect($segments)->contains(fn ($part) => $part === '.' || $part === '..' || str_starts_with($part, '.'))
        ) {
            throw ValidationException::withMessages(['files' => 'Import paths must be safe relative Markdown paths.']);
        }

        return $segments;
    }

    private function ensureFolders(
        ProjectMemoryVault $vault,
        array $segments,
        array &$cache
    ): ?ProjectMemoryNode {
        $parent = null;
        $path = '';
        foreach ($segments as $segment) {
            $path .= ($path === '' ? '' : '/').$segment;
            if (isset($cache[$path])) {
                $parent = $cache[$path];

                continue;
            }
            $folder = $vault->nodes()
                ->where('parent_id', $parent?->id)
                ->where('name', $segment)
                ->first();
            if ($folder && $folder->type !== 'folder') {
                throw ValidationException::withMessages(['files' => "A document blocks the folder path {$path}."]);
            }
            $parent = $folder ?: $vault->nodes()->create([
                'parent_id' => $parent?->id,
                'type' => 'folder',
                'name' => mb_substr($segment, 0, 255),
                'source' => 'markdown_import',
                'source_path' => $path,
                'position' => $this->vaults->nextPosition($vault, $parent?->id),
                'version' => 1,
            ]);
            $cache[$path] = $parent;
        }

        return $parent;
    }

    private function availableName(ProjectMemoryVault $vault, ?string $parentId, string $name): string
    {
        for ($suffix = 2; $suffix <= 999; $suffix++) {
            $candidate = mb_substr("{$name} {$suffix}", 0, 255);
            if (! $vault->nodes()->where('parent_id', $parentId)->where('name', $candidate)->exists()) {
                return $candidate;
            }
        }

        throw ValidationException::withMessages(['files' => 'Too many files have the same name.']);
    }
}
