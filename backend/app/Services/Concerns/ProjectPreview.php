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
                $this->previewShell($project['name'], 'Project analyzed. A built browser entry was not found yet, so Vibyra is showing this phone-viewable project preview immediately.')
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
        foreach (['dist/index.html', 'build/index.html', 'out/index.html', '.output/public/index.html', 'public/index.html', 'web/index.html', 'www/index.html', 'client/dist/index.html', 'frontend/dist/index.html', 'apps/web/dist/index.html', 'packages/web/dist/index.html', 'storybook-static/index.html', 'docs/index.html', 'game/index.html', 'demo/index.html', 'app/index.html', 'index.html'] as $candidate) {
            $filePath = $this->safePreviewFile($project, $candidate);
            if ($filePath && ! $this->isSourceOnlyPreviewHtml(File::get($filePath), $candidate)) {
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
            'js', 'jsx', 'mjs', 'ts', 'tsx' => 'application/javascript; charset=UTF-8',
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
            $base = str_starts_with($value, '/') && $entryBase !== $rootBase ? $entryBase : (str_starts_with($value, '/') ? $rootBase : $entryBase);

            return $match[1].'="'.$base.$cleaned.'"';
        }, $html) ?? $html;
    }

    private function isSourceOnlyPreviewHtml(string $html, string $entryPath): bool
    {
        if ($entryPath !== 'index.html') {
            return false;
        }

        return preg_match('/<script\b[^>]*\bsrc=["\'](?:\.?\/)?src\/(?:main|index|app)\.(?:jsx?|tsx?)["\']/i', $html) === 1
            || preg_match('/<script\b[^>]*\btype=["\']module["\'][^>]*\bsrc=["\'](?:\.?\/)?src\//i', $html) === 1
            || preg_match('/@vite\/client|vite\/client/i', $html) === 1;
    }

    private function previewUrl(string $projectId, string $token): string
    {
        return '/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/';
    }

    private function isPreviewImagePath(string $path): bool
    {
        $extension = strtolower(pathinfo(parse_url($path, PHP_URL_PATH) ?: $path, PATHINFO_EXTENSION));

        return in_array($extension, ['gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'], true);
    }

    private function missingPreviewImageSvg(): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#21163a"/><stop offset="1" stop-color="#0b0d17"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><path d="M120 404 302 242l118 102 78-70 342 130v46H120z" fill="#8e3cff" opacity=".42"/><circle cx="690" cy="170" r="58" fill="#d7c4ff" opacity=".72"/><text x="480" y="478" fill="#efe8ff" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle">Image asset not included</text></svg>';
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
