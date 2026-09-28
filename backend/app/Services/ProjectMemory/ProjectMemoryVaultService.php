<?php

namespace App\Services\ProjectMemory;

use App\Models\ProjectMemoryNode;
use App\Models\ProjectMemoryVault;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProjectMemoryVaultService
{
    public const MAX_MARKDOWN_BYTES = 512000;
    public function payload(User $user, string $projectId): array
    {
        $vault = $this->vault($user, $projectId);

        return $this->vaultPayload($vault);
    }

    public function createNode(User $user, string $projectId, array $attributes): array
    {
        return DB::transaction(function () use ($user, $projectId, $attributes) {
            $vault = $this->lockedVault($user, $projectId);
            $parent = $this->parentFolder($vault, $attributes['parentId'] ?? null);
            $type = (string) $attributes['type'];
            $name = $this->normalizedName($attributes['name']);
            $content = $type === 'document' ? (string) ($attributes['markdown'] ?? '') : null;
            $this->assertMarkdownSize($content);
            $this->assertUniqueName($vault, $parent?->id, $name);

            $node = $vault->nodes()->create([
                'parent_id' => $parent?->id,
                'type' => $type,
                'name' => $name,
                'markdown_content' => $content,
                'source' => 'native',
                'position' => $this->nextPosition($vault, $parent?->id),
                'version' => 1,
            ]);
            $this->bumpRevision($vault);

            return $this->nodePayload($node);
        });
    }
    public function updateNode(
        User $user,
        string $projectId,
        string $nodeId,
        array $attributes
    ): array {
        return DB::transaction(function () use ($user, $projectId, $nodeId, $attributes) {
            $vault = $this->lockedVault($user, $projectId);
            $node = $this->node($vault, $nodeId, true);
            $expectedVersion = $attributes['version'] ?? null;
            if ($expectedVersion !== null && (int) $expectedVersion !== $node->version) {
                abort(409, 'This memory changed since it was opened.');
            }

            $parentId = array_key_exists('parentId', $attributes)
                ? ($attributes['parentId'] ?: null)
                : $node->parent_id;
            $parent = $this->parentFolder($vault, $parentId, $node->id);
            $name = array_key_exists('name', $attributes)
                ? $this->normalizedName($attributes['name'])
                : $node->name;
            $this->assertUniqueName($vault, $parent?->id, $name, $node->id);

            $changes = ['parent_id' => $parent?->id, 'name' => $name];
            if ($node->type === 'document' && array_key_exists('markdown', $attributes)) {
                $changes['markdown_content'] = (string) $attributes['markdown'];
                $this->assertMarkdownSize($changes['markdown_content']);
            }
            $changes['version'] = $node->version + 1;
            $node->forceFill($changes)->save();
            $this->bumpRevision($vault);

            return $this->nodePayload($node->fresh());
        });
    }
    public function deleteNode(
        User $user,
        string $projectId,
        string $nodeId,
        bool $recursive
    ): array {
        return DB::transaction(function () use ($user, $projectId, $nodeId, $recursive) {
            $vault = $this->lockedVault($user, $projectId);
            $node = $this->node($vault, $nodeId, true);
            if ($node->type === 'folder' && $node->children()->exists() && ! $recursive) {
                abort(409, 'The folder is not empty. Confirm recursive deletion to continue.');
            }

            $node->delete();
            $this->bumpRevision($vault);

            return ['ok' => true, 'deletedId' => $nodeId, 'revision' => $vault->revision];
        });
    }
    public function vault(User $user, string $projectId): ProjectMemoryVault
    {
        $projectId = $this->normalizedProjectId($projectId);

        return ProjectMemoryVault::query()->firstOrCreate([
            'user_id' => $user->id,
            'project_id' => $projectId,
        ], ['revision' => 0]);
    }

    public function lockedVault(User $user, string $projectId): ProjectMemoryVault
    {
        $vault = $this->vault($user, $projectId);

        return ProjectMemoryVault::query()->lockForUpdate()->findOrFail($vault->id);
    }

    public function parentFolder(
        ProjectMemoryVault $vault,
        mixed $parentId,
        ?string $excludedNodeId = null
    ): ?ProjectMemoryNode {
        if ($parentId === null || trim((string) $parentId) === '') {
            return null;
        }
        $parent = $this->node($vault, (string) $parentId);
        if ($parent->type !== 'folder' || $parent->id === $excludedNodeId) {
            throw ValidationException::withMessages(['parentId' => 'Choose a valid folder.']);
        }
        if ($excludedNodeId && $this->isDescendant($parent, $excludedNodeId)) {
            throw ValidationException::withMessages(['parentId' => 'A folder cannot contain itself.']);
        }

        return $parent;
    }

    public function nextPosition(ProjectMemoryVault $vault, ?string $parentId): int
    {
        return ((int) $vault->nodes()->where('parent_id', $parentId)->max('position')) + 1;
    }

    public function assertUniqueName(
        ProjectMemoryVault $vault,
        ?string $parentId,
        string $name,
        ?string $exceptId = null
    ): void {
        $query = $vault->nodes()->where('parent_id', $parentId)->where('name', $name);
        if ($exceptId) {
            $query->whereKeyNot($exceptId);
        }
        if ($query->exists()) {
            throw ValidationException::withMessages(['name' => 'That name already exists in this folder.']);
        }
    }

    public function nodePayload(ProjectMemoryNode $node): array
    {
        return [
            'id' => $node->id,
            'parentId' => $node->parent_id,
            'type' => $node->type,
            'name' => $node->name,
            'markdown' => $node->type === 'document' ? ($node->markdown_content ?? '') : null,
            'source' => $node->source,
            'sourcePath' => $node->source_path,
            'position' => $node->position,
            'version' => $node->version,
            'createdAt' => $node->created_at?->toISOString(),
            'updatedAt' => $node->updated_at?->toISOString(),
        ];
    }

    public function bumpRevision(ProjectMemoryVault $vault): void
    {
        $vault->increment('revision');
        $vault->refresh();
    }

    private function vaultPayload(ProjectMemoryVault $vault): array
    {
        return [
            'ok' => true,
            'vault' => [
                'projectId' => $vault->project_id,
                'revision' => $vault->revision,
                'nodes' => $vault->nodes()
                    ->orderBy('parent_id')
                    ->orderBy('position')
                    ->get()
                    ->map(fn (ProjectMemoryNode $node) => $this->nodePayload($node))
                    ->values()
                    ->all(),
                'updatedAt' => $vault->updated_at?->toISOString(),
            ],
        ];
    }

    private function node(
        ProjectMemoryVault $vault,
        string $nodeId,
        bool $lock = false
    ): ProjectMemoryNode {
        $query = $vault->nodes()->whereKey($nodeId);
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->firstOrFail();
    }

    private function normalizedProjectId(string $projectId): string
    {
        $projectId = trim($projectId);
        if ($projectId === '' || mb_strlen($projectId) > 190) {
            throw ValidationException::withMessages(['projectId' => 'Choose a valid project.']);
        }

        return $projectId;
    }

    private function normalizedName(mixed $name): string
    {
        $name = trim((string) $name);
        if ($name === '' || mb_strlen($name) > 255 || str_contains($name, '/')) {
            throw ValidationException::withMessages(['name' => 'Enter a valid name without slashes.']);
        }

        return $name;
    }

    private function assertMarkdownSize(?string $content): void
    {
        if ($content !== null && strlen($content) > self::MAX_MARKDOWN_BYTES) {
            throw ValidationException::withMessages(['markdown' => 'Markdown files cannot exceed 500 KB.']);
        }
    }

    private function isDescendant(ProjectMemoryNode $node, string $ancestorId): bool
    {
        while ($node->parent_id) {
            if ($node->parent_id === $ancestorId) {
                return true;
            }
            $node = ProjectMemoryNode::query()->findOrFail($node->parent_id);
        }

        return false;
    }
}
