<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\File;

trait ProjectPreview
{
    public function projectPreview(string $projectId, string $token, string $path = ''): array
    {
        $state = $this->read();

        if (! hash_equals((string) $state['token'], $token)) {
            return $this->previewHtmlResponse(
                $this->previewShell('Preview link expired', 'Reconnect your phone to Vibyra Desktop and open the project again.'),
                401
            );
        }

        $project = $this->projectByExactId($state, $projectId);
        if (! $project) {
            $state['projects'] = $this->discoverProjects();
            $this->write($state);
            $project = $this->projectByExactId($state, $projectId);
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
                $this->previewShell($project['name'], 'This project does not have a phone-viewable app entry yet.')
            );
        }

        $filePath = $this->safePreviewFile($project, $relativePath);
        if (! $filePath) {
            return $this->previewHtmlResponse(
                $this->previewShell('Preview file missing', 'The requested preview asset is no longer available.'),
                404
            );
        }

        $contentType = $this->previewContentType($filePath);
        $body = File::get($filePath);

        if (str_starts_with($contentType, 'text/html')) {
            $entryDirectory = dirname($requestedPath !== '' ? $relativePath : $entryPath);
            $body = $this->rewritePreviewHtml($body, $project['id'], $token, $entryDirectory === '.' ? '' : $entryDirectory);
        }

        return [
            'body' => $body,
            'contentType' => $contentType,
            'status' => 200,
        ];
    }

    private function projectByExactId(array $state, string $projectId): ?array
    {
        foreach ($state['projects'] as $project) {
            if (($project['id'] ?? '') === $projectId) {
                return $project;
            }
        }

        return null;
    }

    private function previewEntryPath(array $project): string
    {
        foreach (['index.html', 'dist/index.html', 'build/index.html', 'public/index.html', 'web/index.html'] as $candidate) {
            if ($this->safePreviewFile($project, $candidate)) {
                return $candidate;
            }
        }

        return '';
    }

    private function safePreviewFile(array $project, string $relativePath): ?string
    {
        $root = realpath((string) $project['path']);
        if (! $root) {
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

    private function previewContentType(string $filePath): string
    {
        return match (strtolower(pathinfo($filePath, PATHINFO_EXTENSION))) {
            'css' => 'text/css; charset=UTF-8',
            'gif' => 'image/gif',
            'html', 'htm' => 'text/html; charset=UTF-8',
            'jpeg', 'jpg' => 'image/jpeg',
            'js', 'mjs' => 'application/javascript; charset=UTF-8',
            'json' => 'application/json; charset=UTF-8',
            'png' => 'image/png',
            'svg' => 'image/svg+xml; charset=UTF-8',
            'webp' => 'image/webp',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            default => 'application/octet-stream',
        };
    }

    private function rewritePreviewHtml(string $html, string $projectId, string $token, string $entryDirectory): string
    {
        $rootBase = $this->previewUrl($projectId, $token);
        $entryDirectory = trim($entryDirectory, '/');
        $entryBase = $rootBase.($entryDirectory !== '' ? $entryDirectory.'/' : '');

        return preg_replace_callback('/\b(src|href)=(["\'])(?!https?:|data:|mailto:|tel:|#)([^"\']+)\2/i', function (array $match) use ($entryBase, $rootBase): string {
            $value = (string) $match[3];
            $cleaned = preg_replace('/^\.?\//', '', $value) ?: '';
            $base = str_starts_with($value, '/') ? $rootBase : $entryBase;

            return $match[1].'="'.$base.$cleaned.'"';
        }, $html) ?? $html;
    }

    private function previewUrl(string $projectId, string $token): string
    {
        return '/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/';
    }

    private function previewHtmlResponse(string $body, int $status = 200): array
    {
        return [
            'body' => $body,
            'contentType' => 'text/html; charset=UTF-8',
            'status' => $status,
        ];
    }

    private function previewShell(string $title, string $message): string
    {
        return '<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>'.e($title).'</title>
    <style>
      :root { color-scheme: dark; --bg: #07080f; --panel: #10121c; --line: #2c2442; --text: #f7f3ff; --muted: #b8b1ca; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(560px, 100%); border: 1px solid var(--line); border-radius: 18px; background: var(--panel); padding: 26px; }
      h1 { margin: 0 0 10px; font-size: clamp(28px, 8vw, 48px); line-height: 1; }
      p { margin: 0; color: var(--muted); font-size: 16px; font-weight: 700; line-height: 1.55; }
    </style>
  </head>
  <body><main><h1>'.e($title).'</h1><p>'.e($message).'</p></main></body>
</html>';
    }
}
