<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use App\Models\PublishedProjectDeployment;
use App\Models\PublishedProjectReaction;
use App\Models\User;
use App\Policies\PublishedProjectPolicy;
use App\Services\Community\ProjectSafetyReview;
use App\Services\Deployments\RuntimeDemoLifecycleService;
use App\Services\Deployments\DeploymentArtifactStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

trait CommunityPublishingHostedDemo
{
    private function hostedDemoFile(PublishedProjectDeployment $deployment, ?string $path): ?array
    {
        $files = app(DeploymentArtifactStore::class)->files($deployment);
        if ($files === []) {
            return null;
        }

        $requested = $this->normalizeHostedDemoPath($path ?: (string) $deployment->entry_path);
        foreach ($files as $file) {
            if (($file['path'] ?? '') === $requested) {
                return $file;
            }
        }

        return null;
    }

    private function normalizeHostedDemoBundle(array $value): ?array
    {
        if (($value['ok'] ?? false) !== true) {
            return null;
        }

        $entryPath = $this->normalizeHostedDemoPath((string) ($value['entryPath'] ?? ''));
        $files = [];
        $seenPaths = [];
        $totalBytes = 0;
        if (count((array) ($value['files'] ?? [])) > 220 || (bool) data_get($value, 'metadata.truncated', false)) return null;

        foreach (array_slice((array) ($value['files'] ?? []), 0, 220) as $file) {
            if (! is_array($file)) {
                continue;
            }
            $path = $this->normalizeHostedDemoPath((string) ($file['path'] ?? ''));
            $encoding = (string) ($file['encoding'] ?? 'utf8');
            $body = (string) ($file['body'] ?? '');
            if ($path === '' || $this->unsafeHostedDemoPath($path) || ! in_array($encoding, ['utf8', 'base64'], true) || $body === '') {
                return null;
            }
            if (isset($seenPaths[$path])) return null;
            $seenPaths[$path] = true;
            $decoded = $encoding === 'base64' ? base64_decode($body, true) : $body;
            if ($decoded === false || strlen($body) > 2_800_000) return null;
            // URL safety applies to encoded HTML/JS too, not only UTF-8 transport.
            $isText = mb_check_encoding($decoded, 'UTF-8');
            if ($isText) {
                $decoded = $this->neutralizeCompiledPrivateUrlLiterals($decoded, ['path' => $path]);
                if ($this->containsUnsafePublishedUrl($decoded, ['path' => $path])) return null;
                $body = $encoding === 'base64' ? base64_encode($decoded) : $decoded;
            }
            $totalBytes += strlen($body);
            if ($totalBytes > 11_000_000) {
                return null;
            }
            $files[] = [
                'path' => $path,
                'contentType' => $this->safeHostedDemoContentType((string) ($file['contentType'] ?? 'application/octet-stream')),
                'encoding' => $encoding,
                'size' => strlen($decoded),
                'body' => $body,
            ];
        }

        if ($entryPath === '' || $files === [] || ! $this->demoFilesContain($files, $entryPath)) {
            return null;
        }

        return [
            'entryPath' => $entryPath,
            'files' => $files,
            'metadata' => [
                'kind' => Str::limit((string) ($value['kind'] ?? 'static-demo-bundle'), 80, ''),
                'mountDirectory' => Str::limit((string) ($value['mountDirectory'] ?? ''), 240, ''),
                'source' => 'desktop-publish-demo-bundle',
                'totalFiles' => count($files),
            ],
        ];
    }

    private function demoFilesContain(array $files, string $path): bool
    {
        foreach ($files as $file) {
            if (($file['path'] ?? '') === $path) {
                return true;
            }
        }

        return false;
    }

    private function normalizeHostedDemoPath(string $path): string
    {
        $path = trim(str_replace('\\', '/', $path), '/');
        $parts = array_values(array_filter(explode('/', $path), fn ($part) => $part !== '' && $part !== '.'));
        if (in_array('..', $parts, true)) {
            return '';
        }

        return implode('/', $parts);
    }

    private function unsafeHostedDemoPath(string $path): bool
    {
        return preg_match('/(^|\/)(?:\.env|\.git|\.expo|\.vibyra-agent|node_modules|vendor|secrets?|credentials?)(?:\/|$)/i', $path) === 1
            || preg_match('/\.(?:pem|key|p12|pfx|sqlite|sqlite3|db)$/i', $path) === 1;
    }

    private function rewriteHostedDemoText(string $body, string $contentType, PublishedProjectDeployment $deployment, PublishedProject $project, string $filePath): string
    {
        if (! str_contains($contentType, 'text/html') && ! str_contains($contentType, 'text/css') && ! str_contains($contentType, 'javascript')) {
            return $body;
        }

        $base = $this->hostedDemoPath($project).'/';
        $mount = trim((string) data_get($deployment->metadata, 'mountDirectory', ''), '/');
        $documentDir = trim(str_replace('\\', '/', dirname($filePath)), '. /');
        $rewrite = function (string $value) use ($base, $mount, $documentDir): string {
            $raw = trim($value);
            if ($raw === '' || preg_match('/^(?:https?:|\/\/|data:|blob:|mailto:|tel:|javascript:|#)/i', $raw) === 1) {
                return $value;
            }
            $clean = ltrim($raw, '/');
            $prefix = str_starts_with($raw, '/') ? $mount : $documentDir;

            return $base.($prefix !== '' ? trim($prefix, '/').'/' : '').$clean;
        };

        if (str_contains($contentType, 'text/html')) {
            $body = preg_replace_callback('/\b(src|href|poster)=["\']([^"\']+)["\']/i', fn ($match) => $match[1].'="'.$rewrite($match[2]).'"', $body) ?? $body;
        }

        if (str_contains($contentType, 'text/css') || str_contains($contentType, 'text/html')) {
            $body = preg_replace_callback('/url\(\s*(["\']?)([^"\')]+)\1\s*\)/i', fn ($match) => 'url('.$match[1].$rewrite($match[2]).$match[1].')', $body) ?? $body;
        }

        return $body;
    }
}
