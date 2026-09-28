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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

trait CommunityPublishingRuntimeBundle
{
    private function normalizeRuntimeBundle(array $value): ?array
    {
        $platform = (string) ($value['platform'] ?? '');
        if (($value['ok'] ?? false) !== true || ! in_array($platform, ['node', 'laravel', 'python'], true)) {
            return null;
        }
        if ((bool) data_get($value, 'metadata.truncated', false) || count((array) ($value['files'] ?? [])) > 320) {
            return null;
        }
        $frontendDistDirectory = $platform === 'python'
            ? $this->normalizePythonFrontendDirectory((string) data_get($value, 'metadata.frontendDistDirectory', ''))
            : '';

        $files = [];
        $seenPaths = [];
        $totalBytes = 0;
        foreach ((array) ($value['files'] ?? []) as $file) {
            if (! is_array($file)) {
                return null;
            }
            $path = $this->normalizeHostedDemoPath((string) ($file['path'] ?? ''));
            $encoding = (string) ($file['encoding'] ?? 'utf8');
            $body = (string) ($file['body'] ?? '');
            if ($path === '' || $this->unsafeHostedDemoPath($path) || $this->unsafeRuntimeSourcePath($path, $platform, $frontendDistDirectory) || ! in_array($encoding, ['utf8', 'base64'], true) || $body === '') {
                return null;
            }
            if (isset($seenPaths[$path])) {
                return null;
            }
            $seenPaths[$path] = true;
            if ($encoding === 'base64' && base64_decode($body, true) === false) {
                return null;
            }
            if ($encoding === 'utf8' && $this->isGeneratedRuntimeAssetPath($path, $frontendDistDirectory)) {
                $body = $this->neutralizeCompiledPrivateUrlLiterals($body, ['path' => $path]);
            }
            if ($encoding === 'utf8'
                && $this->runtimePrivateUrlMustBePublic($path, $platform, $frontendDistDirectory)
                && $this->containsUnsafePublishedUrl($body, ['path' => $path])) {
                return null;
            }
            $totalBytes += strlen($body);
            if ($totalBytes > 10_000_000) {
                return null;
            }
            $fileLimit = $this->isGeneratedBuildAssetPath($path) ? 2_800_000 : 1_400_000;
            if (strlen($body) > $fileLimit) {
                return null;
            }
            $files[] = [
                'path' => $path,
                'contentType' => Str::limit((string) ($file['contentType'] ?? 'text/plain; charset=UTF-8'), 120, ''),
                'encoding' => $encoding,
                'size' => min((int) ($file['size'] ?? strlen($body)), $fileLimit),
                'body' => $body,
            ];
        }

        $requiredRootFiles = match ($platform) {
            'laravel' => ['composer.json'],
            'python' => ['requirements.txt', 'pyproject.toml'],
            default => ['package.json'],
        };
        if ($files === [] || ! collect($requiredRootFiles)->contains(fn (string $path) => $this->demoFilesContain($files, $path))) {
            return null;
        }
        if (trim((string) ($value['startCommand'] ?? '')) === '') {
            return null;
        }
        if ($frontendDistDirectory !== '' && (
            ! $this->demoFilesContain($files, $frontendDistDirectory.'/index.html')
            || ! $this->demoFilesContain($files, '_vibyra_runtime.py')
        )) {
            return null;
        }
        $frontendIncluded = $frontendDistDirectory !== ''
            || ($platform === 'laravel' && collect($files)->contains(
                fn (array $file) => str_starts_with((string) ($file['path'] ?? ''), 'public/build/')
            ));

        return [
            'files' => $files,
            'buildCommand' => Str::limit((string) ($value['buildCommand'] ?? ''), 320, ''),
            'startCommand' => Str::limit((string) ($value['startCommand'] ?? ''), 320, ''),
            'metadata' => [
                'kind' => 'runtime-source-bundle',
                'platform' => $platform,
                'source' => 'desktop-publish-runtime-bundle',
                'runtimeReason' => Str::limit((string) ($value['runtimeReason'] ?? ''), 220, ''),
                'totalFiles' => count($files),
                'requiresProviderWorker' => true,
                'frontendDistDirectory' => $frontendDistDirectory ?: null,
                'frontendIncluded' => $frontendIncluded,
            ],
        ];
    }

    private function runtimeReviewFiles(?array $runtimeBundle, mixed $sourceFiles): array
    {
        $runtimeFiles = [];
        $frontendDistDirectory = trim((string) data_get($runtimeBundle, 'metadata.frontendDistDirectory', ''), '/');
        foreach ((array) ($runtimeBundle['files'] ?? []) as $file) {
            if (! is_array($file) || ($file['encoding'] ?? 'utf8') !== 'utf8') {
                continue;
            }
            $path = (string) ($file['path'] ?? '');
            if (($frontendDistDirectory !== ''
                    && ($path === $frontendDistDirectory || str_starts_with($path, $frontendDistDirectory.'/')))
                || str_starts_with($path, 'public/build/')) {
                continue;
            }
            $runtimeFiles[] = [
                'path' => $path,
                'language' => pathinfo($path, PATHINFO_EXTENSION),
                'body' => (string) ($file['body'] ?? ''),
            ];
        }

        return array_slice([...$runtimeFiles, ...(is_array($sourceFiles) ? $sourceFiles : [])], 0, 80);
    }

    private function isGeneratedBuildAssetPath(string $path): bool
    {
        return preg_match('#^(?:public/)?build/assets/#i', $path) === 1;
    }

    private function isGeneratedRuntimeAssetPath(string $path, string $frontendDistDirectory): bool
    {
        return $this->isGeneratedBuildAssetPath($path)
            || ($frontendDistDirectory !== '' && str_starts_with($path, $frontendDistDirectory.'/'));
    }
}
