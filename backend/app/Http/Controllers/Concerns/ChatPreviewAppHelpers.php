<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait ChatPreviewAppHelpers
{
    private function resolveChatMode(Request $request, string $prompt, ?array $skill): string
    {
        if (preg_match('/^the live preview for .+ crashed while running the existing project\./i', trim($prompt))) {
            return 'chat';
        }

        if (($skill['mode'] ?? null) === 'build') {
            return 'build';
        }

        $mode = strtolower(trim((string) $request->input('mode', '')));
        if (in_array($mode, ['chat', 'build'], true)) {
            return $mode;
        }

        return $this->isBuildPrompt($prompt) ? 'build' : 'chat';
    }

    private function extractRunnableApp(string $reply, bool $allowApp = true): array
    {
        if (! $allowApp) {
            $cleanedReply = trim(preg_replace('/<vibyra-app[\s\S]*?<\/vibyra-app>/i', '', $reply));
            return [$cleanedReply !== '' ? $cleanedReply : 'I can answer that without changing the preview.', null];
        }

        if (! preg_match('/<vibyra-app(?:\s+title="([^"]*)")?\s*>([\s\S]*?)<\/vibyra-app>/i', $reply, $match)) {
            return [$reply, null];
        }

        $title = trim($match[1] ?? '') ?: 'Generated app';
        $html = trim($match[2] ?? '');
        if ($html === '') {
            return [$reply, null];
        }

        $validationError = $this->previewHtmlValidationError($html);
        if ($validationError !== null) {
            $cleanedReply = trim(preg_replace('/<vibyra-app[\s\S]*?<\/vibyra-app>/i', '', $reply));
            return [
                $cleanedReply !== '' ? $cleanedReply : "I could not attach a runnable phone preview because {$validationError}. Ask me to rebuild it as one self-contained HTML preview.",
                null,
            ];
        }

        $cleanedReply = trim(preg_replace('/<vibyra-app[\s\S]*?<\/vibyra-app>/i', '', $reply));
        if ($cleanedReply === '') {
            $cleanedReply = "I built `{$title}` — tap the preview below to run it.";
        }

        return [$cleanedReply, [
            'id' => Str::uuid()->toString(),
            'title' => $title,
            'html' => $this->ensureContentSecurityPolicy($html),
        ]];
    }

    private function ensureContentSecurityPolicy(string $html): string
    {
        if (stripos($html, 'http-equiv="Content-Security-Policy"') !== false) {
            return $html;
        }

        $csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com;\">";

        if (stripos($html, '<head>') !== false) {
            return preg_replace('/<head>/i', "<head>\n{$csp}", $html, 1);
        }
        if (stripos($html, '<html') !== false) {
            return preg_replace('/<html([^>]*)>/i', "<html$1>\n<head>{$csp}</head>", $html, 1);
        }
        return "<!doctype html><html><head>{$csp}</head><body>{$html}</body></html>";
    }

    private function previewHtmlValidationError(string $html): ?string
    {
        if (preg_match('/<script\b[^>]*\bsrc\s*=\s*["\'](?!https?:|data:|blob:|\/\/|about:)([^"\']+)["\']/i', $html, $match) === 1) {
            return 'it referenced an unbundled local script (`'.e($match[1]).'`)';
        }

        if (preg_match('/<script\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']/i', $html, $match) === 1) {
            $scriptError = $this->previewExternalResourceValidationError($match[1], 'script');
            if ($scriptError !== null) {
                return $scriptError;
            }
        }

        if (preg_match('/<script\b[^>]*\btype\s*=\s*["\']module["\'][^>]*\bsrc\s*=\s*["\']([^"\']+)["\']/i', $html, $match) === 1) {
            return 'it referenced a module entry file (`'.e($match[1]).'`) instead of inline JavaScript';
        }

        if (preg_match('/<script\b[^>]*\btype\s*=\s*["\']module["\'][^>]*>[\s\S]*?\bimport\s+(?:[({*]|\w)/i', $html) === 1) {
            return 'it used module imports that cannot run as a self-contained phone preview';
        }

        if (preg_match('/<link\b(?=[^>]*\brel\s*=\s*["\']?(?:stylesheet|modulepreload|preload))[^>]*\bhref\s*=\s*["\'](?!https?:|data:|\/\/|about:)([^"\']+)["\']/i', $html, $match) === 1) {
            return 'it referenced an unbundled local stylesheet or preload (`'.e($match[1]).'`)';
        }

        if (preg_match('/<link\b(?=[^>]*\brel\s*=\s*["\']?(?:stylesheet|modulepreload|preload))[^>]*\bhref\s*=\s*["\']([^"\']+)["\']/i', $html, $match) === 1) {
            $linkError = $this->previewExternalResourceValidationError($match[1], 'stylesheet or preload');
            if ($linkError !== null) {
                return $linkError;
            }
        }

        return null;
    }

    private function previewExternalResourceValidationError(string $url, string $kind): ?string
    {
        $value = trim($url);
        if ($value === '' || preg_match('/^(?:data|blob|about):/i', $value) === 1) {
            return null;
        }

        if (preg_match('/(?:^|\/)@vite\/client(?:[?#]|$)/i', $value) === 1
            || preg_match('/(?:^|\/)(?:src|resources\/js)\/[^?#]+\.(?:jsx?|tsx?)(?:[?#].*)?$/i', $value) === 1) {
            return 'it referenced a Vite source '.$kind.' (`'.e($value).'`) instead of inline preview code';
        }

        $host = parse_url($value, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return null;
        }

        if ($this->isLocalPreviewHost($host)) {
            return 'it referenced a local dev-server '.$kind.' (`'.e($value).'`) that phone preview cannot load';
        }

        return null;
    }

}
