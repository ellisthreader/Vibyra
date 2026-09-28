<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\DeploymentArtifactStore;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

trait HandlesRailwayBundleValidation
{
    private function writeSourceBundle(PublishedProjectDeployment $deployment, string $workdir): void
    {
        File::ensureDirectoryExists($workdir);
        $files = app(DeploymentArtifactStore::class)->files($deployment);
        foreach ($files as $file) {
            $path = $this->safeRelativePath((string) ($file['path'] ?? ''));
            if ($path === '') {
                continue;
            }
            $target = $workdir.'/'.$path;
            File::ensureDirectoryExists(dirname($target));
            $body = (string) ($file['body'] ?? '');
            if (($file['encoding'] ?? 'utf8') === 'base64') {
                $body = (string) base64_decode($body, true);
            }
            File::put($target, $body);
        }
        $this->writeLaravelRuntimeDirectories($deployment, $workdir);
    }

    private function validateSourceBundle(PublishedProjectDeployment $deployment): ?string
    {
        $platform = strtolower(trim((string) data_get($deployment->metadata, 'platform', '')));
        if (! in_array($platform, ['node', 'laravel', 'python'], true)) {
            return 'Runtime bundle has an unsupported platform.';
        }
        if (trim((string) $deployment->start_command) === '') {
            return 'Runtime bundle does not include a start command.';
        }
        if ((bool) data_get($deployment->metadata, 'truncated', false)) {
            return 'Runtime bundle is incomplete because source collection was truncated.';
        }
        $files = app(DeploymentArtifactStore::class)->files($deployment);
        if ($files === []) {
            return 'Runtime bundle does not contain any deployable files.';
        }
        if (count($files) > self::MAX_RUNTIME_BUNDLE_FILES) {
            return 'Runtime bundle is too large to host: more than '.self::MAX_RUNTIME_BUNDLE_FILES.' files.';
        }
        $expectedFiles = (int) data_get($deployment->metadata, 'totalFiles', 0);
        if ($expectedFiles > 0 && $expectedFiles !== count($files)) {
            return "Runtime bundle is incomplete: expected {$expectedFiles} files but received ".count($files).'.';
        }
        $paths = [];
        $totalBytes = 0;
        foreach ($files as $file) {
            if (! is_array($file)) {
                return 'Runtime bundle contains an invalid file entry.';
            }
            $rawPath = str_replace('\\', '/', trim((string) ($file['path'] ?? '')));
            $path = $this->safeRelativePath($rawPath);
            if ($path === '' || str_starts_with($rawPath, '/') || preg_match('/^[a-z]:\//i', $rawPath) === 1) {
                return 'Runtime bundle contains an unsafe file path.';
            }
            if (isset($paths[$path])) {
                return "Runtime bundle contains the duplicate file {$path}.";
            }
            $paths[$path] = true;
            $encoding = (string) ($file['encoding'] ?? 'utf8');
            $body = (string) ($file['body'] ?? '');
            if ($encoding === 'base64') {
                $decoded = base64_decode($body, true);
                if ($decoded === false) {
                    return "Runtime bundle file {$path} has invalid base64 content.";
                }
                $bodyBytes = strlen($decoded);
            } elseif ($encoding === 'utf8') {
                $bodyBytes = strlen($body);
            } else {
                return "Runtime bundle file {$path} has an unsupported encoding.";
            }
            if ($bodyBytes === 0) {
                return "Runtime bundle file {$path} is empty.";
            }
            $totalBytes += $bodyBytes;
            if ($totalBytes > self::MAX_RUNTIME_BUNDLE_BYTES) {
                return 'Runtime bundle is too large to host: extracted files exceed 10 MB.';
            }
        }
        $required = match ($platform) {
            'laravel' => ['composer.json', 'artisan', 'public/index.php'],
            'python' => [],
            default => ['package.json'],
        };
        if ($platform === 'python' && ! isset($paths['requirements.txt']) && ! isset($paths['pyproject.toml'])) {
            return 'Runtime bundle is incomplete for Python: missing requirements.txt or pyproject.toml.';
        }
        $missing = array_values(array_filter($required, fn (string $path) => ! isset($paths[$path])));
        if ($missing !== []) {
            return 'Runtime bundle is incomplete for '.Str::headline($platform).': missing '
                .$this->humanList($missing).'.';
        }

        return null;
    }

    private function writeLaravelRuntimeDirectories(PublishedProjectDeployment $deployment, string $workdir): void
    {
        if (($deployment->metadata['platform'] ?? '') !== 'laravel') {
            return;
        }
        $cacheDirectory = $workdir.'/bootstrap/cache';
        File::ensureDirectoryExists($cacheDirectory);
        if (! File::exists($cacheDirectory.'/.gitignore')) {
            File::put($cacheDirectory.'/.gitignore', "*\n!.gitignore\n");
        }
    }
}
