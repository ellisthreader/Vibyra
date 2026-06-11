<?php

namespace App\Services\AI;

use InvalidArgumentException;

class TeamPlanScopeNormalizer
{
    public function __construct(private readonly TeamPlanValues $values) {}

    public function normalize(mixed $raw): array
    {
        if (! is_array($raw) || ! array_is_list($raw) || count($raw) > 24) {
            throw new InvalidArgumentException('Scope must be a bounded list.');
        }

        $scope = array_map(fn ($item) => $this->entry($item), $raw);
        $keys = array_map(fn ($item) => $item['kind'].':'.$item['path'], $scope);
        if (count(array_unique($keys)) !== count($keys)) {
            throw new InvalidArgumentException('Scope entries must be unique.');
        }

        return $scope;
    }

    private function entry(mixed $item): array
    {
        if (! is_array($item) || array_is_list($item)) {
            throw new InvalidArgumentException('Each scope entry must be an object.');
        }
        $this->values->assertKeys($item, ['kind', 'path']);
        $kind = $this->values->text($item['kind'] ?? null, 16);
        if (! in_array($kind, ['file', 'directory'], true)) {
            throw new InvalidArgumentException('Scope kind is unsupported.');
        }

        return ['kind' => $kind, 'path' => $this->path($item['path'] ?? null)];
    }

    private function path(mixed $value): string
    {
        $original = $this->values->text($value, 300);
        $path = preg_replace('#/+#', '/', str_replace('\\', '/', $original)) ?: '';
        $path = trim($path, '/');
        $segments = explode('/', $path);
        if (
            $path === '' || $path === '.'
            || str_starts_with($original, '/')
            || str_starts_with($original, '\\')
            || preg_match('/^[a-z]:/i', $original)
            || in_array('..', $segments, true)
            || str_contains($path, "\0")
            || $this->containsSensitiveSegment($path)
            || str_contains(strtolower($path), '%2e')
        ) {
            throw new InvalidArgumentException('Scope contains an unsafe project path.');
        }

        return $path;
    }

    private function containsSensitiveSegment(string $path): bool
    {
        return (bool) preg_match(
            '/(^|\/)(\.git|\.env(?:\.|$)|\.vibyra-agent|\.codex|\.claude|\.gemini|\.ssh|credentials?)(\/|$)/i',
            $path
        );
    }
}
