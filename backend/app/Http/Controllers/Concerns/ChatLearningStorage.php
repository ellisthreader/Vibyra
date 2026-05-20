<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

trait ChatLearningStorage
{
    private function chatLearningMemoryMeta(object $row, array $item, ?string $projectKey, string $mode): string
    {
        $parts = [];
        $rowMode = (string) ($this->chatLearningRowValue($row, 'mode') ?? '');
        if ($rowMode !== '') {
            $parts[] = $rowMode === $mode ? $rowMode.' mode' : $rowMode.' mode memory';
        }
        $rowProjectKey = $this->chatLearningRowValue($row, 'project_key');
        $rowProjectKey = is_string($rowProjectKey) && $rowProjectKey !== '' ? $rowProjectKey : null;
        $parts[] = $projectKey !== null && $rowProjectKey === $projectKey ? 'same project' : ($rowProjectKey === null ? 'general' : 'different project');
        $tags = array_slice(array_diff($item['tags'], ['chat', 'build']), 0, 4);
        if ($tags !== []) {
            $parts[] = 'tags: '.implode(', ', $tags);
        }
        return implode('; ', $parts);
    }

    private function chatLearningRowValue(object $row, string $field)
    {
        return property_exists($row, $field) ? $row->{$field} : null;
    }

    private function chatLearningMemoryColumns(): array
    {
        static $columns = null;
        if ($columns !== null) {
            return $columns;
        }
        try {
            $columns = Schema::getColumnListing('chat_learning_memories');
        } catch (Throwable) {
            $columns = [];
        }
        return $columns;
    }

    private function chatLearningContextSummary(Request $request, array $tags): string
    {
        $parts = [];
        $filePath = trim((string) $request->input('filePath', ''));
        if ($filePath !== '') {
            $parts[] = 'Selected file: '.$this->chatLearningRedact($filePath);
        }
        $filePaths = $this->chatLearningFilePaths($request);
        if ($filePaths !== []) {
            $parts[] = 'Project files: '.implode(', ', array_slice($filePaths, 0, 8));
        }
        if ($tags !== []) {
            $parts[] = 'Tags: '.implode(', ', array_slice($tags, 0, 10));
        }
        return Str::limit(implode(' | ', $parts), 1000, '');
    }

    private function chatLearningFilePaths(Request $request): array
    {
        $paths = [];
        $selected = trim((string) $request->input('filePath', ''));
        if ($selected !== '') {
            $paths[] = $this->chatLearningRedact($selected);
        }
        foreach (array_slice((array) $request->input('projectFiles', []), 0, 40) as $item) {
            $path = is_array($item) ? trim((string) ($item['path'] ?? '')) : trim((string) $item);
            if ($path !== '') {
                $paths[] = $this->chatLearningRedact($path);
            }
        }
        return array_values(array_unique(array_slice($paths, 0, 40)));
    }

    private function chatLearningErrorSignature(string $value): ?string
    {
        $redacted = $this->chatLearningRedact($value);
        if (preg_match('/\b(?:error|exception|failed|failure|crash|blank|undefined|referenceerror|typeerror|syntaxerror)\b[^.!\n]{0,120}/i', $redacted, $match) !== 1) {
            return null;
        }
        $signature = Str::lower($this->singleLine($match[0]));
        $signature = preg_replace('/\d+/', '#', $signature) ?? $signature;
        return Str::limit($signature, 160, '');
    }

    private function chatLearningRedact(string $value): string
    {
        $value = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', '[email]', $value) ?? $value;
        $value = preg_replace('/\b(?:sk|pk|rk|or|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_\-]{16,}\b/', '[secret]', $value) ?? $value;
        $value = preg_replace('/\b[A-Za-z0-9_\-]{32,}\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}\b/', '[token]', $value) ?? $value;
        $value = preg_replace('/\b(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/i', '$1=[redacted]', $value) ?? $value;
        return $value;
    }

    private function chatLearningProjectKey(string $project): ?string
    {
        $project = trim(Str::lower($project));
        return $project === '' ? null : hash('sha256', $project);
    }

    private function singleLine(string $value): string
    {
        return trim(preg_replace('/\s+/', ' ', $value) ?? $value);
    }

}
