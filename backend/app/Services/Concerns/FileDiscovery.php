<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait FileDiscovery
{
    private function filesForProject(array $project): array
    {
        $path = $project['path'] ?? '';

        if (! is_dir($path)) {
            return [];
        }

        $files = [];
        $directory = new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS);
        $iterator = new \RecursiveIteratorIterator($directory);

        foreach ($iterator as $file) {
            if (! $file->isFile()) {
                continue;
            }

            $relativePath = ltrim(Str::after($file->getPathname(), rtrim($path, '/').'/'), '/');

            if ($this->shouldSkipFile($relativePath, $file->getSize())) {
                continue;
            }

            $entry = $this->fileEntry($project, $relativePath, count($files) === 0);

            if ($entry) {
                $files[] = $entry;
            }

            if (count($files) >= 80) {
                break;
            }
        }

        usort($files, fn ($a, $b) => strcmp($a['path'], $b['path']));

        return $files;
    }

    private function fileEntry(array $project, string $relativePath, bool $includeBody = false): ?array
    {
        $projectPath = realpath($project['path'] ?? '');
        $fullPath = realpath(($project['path'] ?? '').'/'.$relativePath);

        if (! $projectPath || ! $fullPath || ! Str::startsWith($fullPath, $projectPath.'/') || ! is_file($fullPath)) {
            return null;
        }

        if ($this->shouldSkipFile($relativePath, filesize($fullPath) ?: 0)) {
            return null;
        }

        $extension = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION) ?: 'txt');
        $body = '';

        if ($includeBody) {
            $body = File::get($fullPath);

            if (! mb_check_encoding($body, 'UTF-8')) {
                $body = '[Binary file cannot be previewed]';
            }

            $body = Str::limit($body, 20000, "\n\n[Preview truncated]");
        }

        return [
            'id' => rtrim(strtr(base64_encode($fullPath), '+/', '-_'), '='),
            'name' => basename($fullPath),
            'path' => $relativePath,
            'language' => $extension,
            'changed' => 'clean',
            'body' => $body,
        ];
    }

    private function shouldSkipFile(string $relativePath, int $size): bool
    {
        if ($size > 1024 * 1024) {
            return true;
        }

        $segments = explode('/', str_replace('\\', '/', $relativePath));
        $skipDirectories = ['.git', 'node_modules', 'vendor', 'storage', 'dist', 'build', '.expo'];

        if (array_intersect($skipDirectories, $segments)) {
            return true;
        }

        $skipExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'mp4', 'mov', 'glb', 'blend'];

        return in_array(strtolower(pathinfo($relativePath, PATHINFO_EXTENSION)), $skipExtensions, true);
    }
}
