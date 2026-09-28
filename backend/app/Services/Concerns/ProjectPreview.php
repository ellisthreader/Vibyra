<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;

trait ProjectPreview
{
    use ProjectPreviewAssets;
    public function projectPreview(string $projectId, string $token, string $path = ''): array
    {
        $state = $this->read();

        if (! hash_equals((string) $state['token'], $token)) {
            return $this->previewHtmlResponse(
                $this->previewShell('Preview link expired', 'Reconnect your phone to Vibyra Desktop and open the project again.'),
                401
            );
        }

        $project = $this->projectById($state, $projectId);
        if (! $project) {
            $state['projects'] = $this->discoverProjects();
            $this->write($state);
            $project = $this->projectById($state, $projectId);
        }

        if (! $project) {
            return $this->previewHtmlResponse(
                $this->previewShell('Project not found', 'Vibyra Desktop could not find that workspace anymore.'),
                404
            );
        }

        $requestedPath = ltrim(str_replace('\\', '/', trim($path)), '/');
        $entryPath = $this->previewEntryPath($project);
        $relativePath = $requestedPath !== '' ? $requestedPath : $entryPath;

        if ($relativePath === '') {
            return $this->previewHtmlResponse(
                $this->previewShell('No runnable preview found', 'Vibyra could not find a built browser entry for this folder.'),
                404
            );
        }

        $filePath = $this->safePreviewFile($project, $relativePath);
        if (! $filePath) {
            if ($this->isPreviewImagePath($relativePath)) {
                return [
                    'body' => $this->missingPreviewImageSvg(),
                    'contentType' => 'image/svg+xml; charset=UTF-8',
                    'status' => 200,
                ];
            }

            return $this->previewHtmlResponse(
                $this->previewShell('Preview file missing', 'The requested preview asset is no longer available.'),
                404
            );
        }

        $contentType = $this->previewContentType($filePath);
        $body = File::get($filePath);
        $mountDirectory = $this->previewMountDirectory($entryPath);

        if (str_starts_with($contentType, 'text/html')) {
            $documentDirectory = $requestedPath !== '' ? dirname($relativePath) : $mountDirectory;
            $body = $this->rewritePreviewHtml($body, $project['id'], $token, $documentDirectory === '.' ? '' : $documentDirectory, $mountDirectory);
        } elseif (str_starts_with($contentType, 'text/css')) {
            $body = $this->rewritePreviewCss($body, $project['id'], $token, $mountDirectory);
        }

        return [
            'body' => $body,
            'contentType' => $contentType,
            'status' => 200,
        ];
    }

    private function previewEntryPath(array $project): string
    {
        if ($this->shouldSkipStaticPreviewEntries($project)) {
            return '';
        }

        foreach (['dist/index.html', 'build/index.html', 'out/index.html', '.output/public/index.html', 'public/index.html', 'web/index.html', 'www/index.html', 'client/dist/index.html', 'frontend/dist/index.html', 'apps/web/dist/index.html', 'packages/web/dist/index.html', 'storybook-static/index.html', 'docs/index.html', 'game/index.html', 'demo/index.html', 'app/index.html', 'index.html'] as $candidate) {
            $filePath = $this->safePreviewFile($project, $candidate);
            if ($filePath && ! $this->isSourceOnlyPreviewHtml(File::get($filePath), $candidate)) {
                return $candidate;
            }
        }

        return '';
    }

    private function shouldSkipStaticPreviewEntries(array $project): bool
    {
        $composerPath = $this->safePreviewFile($project, 'composer.json');
        $packagePath = $this->safePreviewFile($project, 'package.json');

        if (! $composerPath || ! $packagePath) {
            return false;
        }

        return preg_match('/laravel\\\\?\/framework/i', File::get($composerPath)) === 1
            && str_contains(File::get($packagePath), 'laravel-vite-plugin');
    }

    private function safePreviewFile(array $project, string $relativePath): ?string
    {
        $projectPath = trim((string) ($project['path'] ?? ''));
        if ($projectPath === '') {
            return null;
        }

        $root = realpath($projectPath);
        if (! $root || ! is_dir($root)) {
            return null;
        }

        $filePath = realpath($root.'/'.ltrim($relativePath, '/'));
        if (! $filePath || ! File::isFile($filePath)) {
            return null;
        }

        $rootPrefix = rtrim($root, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;
        if (! str_starts_with($filePath, $rootPrefix)) {
            return null;
        }

        $relative = str_replace('\\', '/', substr($filePath, strlen($rootPrefix)));
        if ($relative === '' || str_starts_with($relative, '..')) {
            return null;
        }

        return $filePath;
    }

}
