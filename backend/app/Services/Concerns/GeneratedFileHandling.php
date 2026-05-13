<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait GeneratedFileHandling
{
    private function projectContext(array $project): string
    {
        return collect($this->filesForProject($project))
            ->take(12)
            ->map(fn ($file) => '- '.$file['path'].' ('.$file['language'].')')
            ->implode("\n") ?: 'No readable files found.';
    }

    private function extractGeneratedFiles(array $project, string $responseText): array
    {
        $files = [];

        if (preg_match('/```json\s*(.*?)```/is', $responseText, $match)) {
            $files = $this->filesFromJsonPayload($project, trim($match[1]));
        }

        if (empty($files)) {
            $files = $this->filesFromJsonPayload($project, $responseText);
        }

        if (empty($files) && preg_match_all('/`([^`]+)`\s*\n+\s*Contents:\s*```[a-zA-Z0-9_-]*\s*\n(.*?)```/is', $responseText, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $relativePath = $this->safeRelativePath($project, trim($match[1]));
                $content = rtrim($match[2], "\n")."\n";

                if ($relativePath && trim($content) !== '') {
                    $files[] = ['path' => $relativePath, 'content' => $content];
                }
            }
        }

        return array_slice($files, 0, 12);
    }

    private function filesFromJsonPayload(array $project, string $payload): array
    {
        $payload = trim($payload);
        $start = strpos($payload, '{');
        $end = strrpos($payload, '}');

        if ($start === false || $end === false || $end <= $start) {
            return [];
        }

        $decoded = json_decode(substr($payload, $start, $end - $start + 1), true);
        $files = [];

        foreach (($decoded['files'] ?? []) as $file) {
            $relativePath = $this->safeRelativePath($project, (string) ($file['path'] ?? ''));
            $content = (string) ($file['content'] ?? '');

            if ($relativePath && $content !== '') {
                $files[] = ['path' => $relativePath, 'content' => $content];
            }
        }

        return $files;
    }

    private function applyGeneratedFiles(array $project, array $files): array
    {
        $applied = [];
        $projectPath = rtrim((string) $project['path'], '/');

        foreach ($files as $file) {
            $relativePath = $this->safeRelativePath($project, (string) ($file['path'] ?? ''));
            $content = (string) ($file['content'] ?? '');

            if (! $relativePath || $content === '' || strlen($content) > 200000) {
                continue;
            }

            $fullPath = $projectPath.'/'.$relativePath;
            $previousBody = File::exists($fullPath) ? File::get($fullPath) : null;
            File::ensureDirectoryExists(dirname($fullPath));
            File::put($fullPath, $content);
            $this->recordEvent('Agent', 'Wrote '.$relativePath, 'success');

            $entry = $this->fileEntry($project, $relativePath, true);
            if ($entry) {
                $entry['changed'] = $previousBody === null ? 'added' : 'modified';
                $entry['previousBody'] = $previousBody;
                $applied[] = $entry;
            }
        }

        return $applied;
    }

    private function previewGeneratedFiles(array $project, array $files): array
    {
        $prepared = [];
        $projectPath = rtrim((string) $project['path'], '/');

        foreach ($files as $file) {
            $relativePath = $this->safeRelativePath($project, (string) ($file['path'] ?? ''));
            $content = (string) ($file['content'] ?? '');

            if (! $relativePath || $content === '' || strlen($content) > 200000) {
                continue;
            }

            $fullPath = $projectPath.'/'.$relativePath;
            $previousBody = File::exists($fullPath) ? File::get($fullPath) : null;
            $prepared[] = $this->fileEntryFromContent($fullPath, $relativePath, $content, $previousBody);
        }

        return $prepared;
    }

    private function fileEntryFromContent(string $fullPath, string $relativePath, string $body, ?string $previousBody): array
    {
        $extension = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION) ?: 'txt');
        $previewBody = mb_check_encoding($body, 'UTF-8')
            ? Str::limit($body, 20000, "\n\n[Preview truncated]")
            : '[Binary file cannot be previewed]';

        return [
            'id' => rtrim(strtr(base64_encode($fullPath), '+/', '-_'), '='),
            'name' => basename($fullPath),
            'path' => $relativePath,
            'language' => $extension,
            'changed' => $previousBody === null ? 'added' : 'modified',
            'body' => $previewBody,
            'previousBody' => $previousBody,
        ];
    }

    private function changesForFiles(string $runId, array $files, string $status): array
    {
        return array_values(array_map(function ($file, $index) use ($runId, $status) {
            return [
                'id' => $runId.'-applied-'.$index,
                'file' => $file['path'],
                'summary' => $status === 'applied' ? 'Applied Vibyra generated file' : 'Apply Vibyra generated file',
                'additions' => count(explode("\n", (string) ($file['body'] ?? ''))),
                'deletions' => isset($file['previousBody']) && $file['previousBody'] !== null
                    ? count(explode("\n", (string) $file['previousBody']))
                    : 0,
                'status' => $status,
            ];
        }, $files, array_keys($files)));
    }

    private function safeRelativePath(array $project, string $path): ?string
    {
        $projectPath = rtrim(str_replace('\\', '/', (string) ($project['path'] ?? '')), '/');
        $path = trim(str_replace('\\', '/', $path));
        $path = trim($path, "` \t\n\r\0\x0B");

        if ($path === '') {
            return null;
        }

        if (str_starts_with($path, $projectPath.'/')) {
            $path = substr($path, strlen($projectPath) + 1);
        }

        $path = ltrim($path, '/');
        $segments = array_values(array_filter(explode('/', $path), fn ($segment) => $segment !== ''));

        if (empty($segments) || in_array('..', $segments, true) || in_array('.', $segments, true)) {
            return null;
        }

        if (array_intersect(['.git', 'node_modules', 'vendor', 'storage'], $segments)) {
            return null;
        }

        return implode('/', $segments);
    }
}
