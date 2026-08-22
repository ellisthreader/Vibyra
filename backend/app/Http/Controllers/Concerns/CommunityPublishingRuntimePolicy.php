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

trait CommunityPublishingRuntimePolicy
{
    private function publishBundleFailure(mixed $value, string $target): ?array
    {
        if (! is_array($value) || ($value['ok'] ?? null) === true) {
            return null;
        }

        $message = collect([
            $value['error'] ?? null,
            $value['message'] ?? null,
            $value['reason'] ?? null,
            data_get($value, 'failureReasons.0'),
        ])->first(fn (mixed $item) => is_string($item) && trim($item) !== '');
        $code = trim((string) ($value['code'] ?? ''));
        if ($message === null && $code === '') {
            return null;
        }

        $safeCode = preg_replace('/[^a-z0-9_.-]+/i', '_', $code) ?: '';
        $isFrontend = $target === 'frontend';
        $isFrontendLimit = $isFrontend && (
            $safeCode === 'bundle_limit_exceeded'
            || (bool) data_get($value, 'metadata.truncated', false)
        );

        return [
            'error' => $isFrontendLimit
                ? 'This frontend is too large for Vibyra hosting, so we can’t host it. Remove unnecessary build files or open a smaller app folder, then try again.'
                : Str::limit(trim((string) ($message ?? (
                    $isFrontend
                    ? 'The hosted frontend bundle could not be prepared.'
                    : 'The runtime bundle could not be prepared.'
                ))), 500, ''),
            'code' => Str::limit($safeCode ?: ($isFrontend ? 'hosted_demo_unavailable' : 'runtime_bundle_unavailable'), 100, ''),
            'hostedDemoStatus' => 'unavailable',
            'frontendStatus' => $isFrontend ? 'failed' : 'unavailable',
            'backendStatus' => $isFrontend ? 'not_included' : 'failed',
        ];
    }

    private function runtimeBundleExceedsHostingLimits(array $value): bool
    {
        if (($value['code'] ?? '') === 'runtime_bundle_limit_exceeded'
            || (bool) data_get($value, 'metadata.truncated', false)) {
            return true;
        }

        $files = (array) ($value['files'] ?? []);
        if (count($files) > 320) {
            return true;
        }

        $totalBytes = 0;
        foreach ($files as $file) {
            if (! is_array($file)) {
                continue;
            }
            $path = $this->normalizeHostedDemoPath((string) ($file['path'] ?? ''));
            $bodyBytes = strlen((string) ($file['body'] ?? ''));
            $totalBytes += $bodyBytes;
            $fileLimit = $this->isGeneratedBuildAssetPath($path) ? 2_800_000 : 1_400_000;
            if ($bodyBytes > $fileLimit || $totalBytes > 10_000_000) {
                return true;
            }
        }

        return false;
    }

    private function unsafeRuntimeSourcePath(string $path, string $platform = 'node', string $frontendDistDirectory = ''): bool
    {
        $segments = explode('/', $path);
        $blockedDirs = ['.git', '.expo', '.vibyra-agent', 'node_modules', 'vendor', 'dist', 'build', '.next', '.output'];
        foreach ($segments as $index => $segment) {
            if ($platform === 'laravel' && $segment === 'build' && ($segments[$index - 1] ?? '') === 'public') {
                continue;
            }
            if ($frontendDistDirectory !== '' && $segment === 'dist' && implode('/', array_slice($segments, 0, $index + 1)) === $frontendDistDirectory) {
                continue;
            }
            if (in_array($segment, $blockedDirs, true)) {
                return true;
            }
        }
        foreach ($segments as $segment) {
            if (preg_match('/^\.env(?:\.|$)/i', $segment) === 1) {
                return true;
            }
            if (! $this->isGeneratedBuildAssetPath($path) && preg_match('/(?:^|[-_.])(secret|token|credential|password|private[-_.]?key|api[-_.]?key)(?:[-_.]|$)/i', $segment) === 1) {
                return true;
            }
        }

        return preg_match('/\.(?:db|sqlite3?|pem|key|p12|pfx|crt|cer)$/i', $path) === 1;
    }

    private function normalizePythonFrontendDirectory(string $path): string
    {
        $path = $this->normalizeHostedDemoPath($path);

        return in_array($path, ['frontend/dist', 'client/dist', 'web/dist', 'dist'], true) ? $path : '';
    }

    private function runtimePrivateUrlMustBePublic(string $path, string $platform, string $frontendDistDirectory): bool
    {
        if ($platform === 'node') {
            return true;
        }
        if ($frontendDistDirectory !== '' && ($path === $frontendDistDirectory || str_starts_with($path, $frontendDistDirectory.'/'))) {
            return true;
        }

        return str_starts_with($path, 'public/build/');
    }
}
