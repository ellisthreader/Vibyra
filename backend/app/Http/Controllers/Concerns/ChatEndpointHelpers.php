<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

trait ChatEndpointHelpers
{
    use ChatReplyGuard;
    use ChatLearningMemory;

    private function estimateInputTokens(string $prompt, string $fileBody, array $history, string $projectFiles = '', array $imageAttachments = []): int
    {
        $chars = mb_strlen($prompt) + mb_strlen($fileBody) + mb_strlen($projectFiles);
        foreach ($history as $item) {
            if (is_array($item)) {
                $chars += mb_strlen((string) ($item['text'] ?? ''));
            }
        }
        // Conservative estimate: 1 token ≈ 3.5 chars (over-estimate so we don't under-charge).
        return (int) max(1, ceil($chars / 3.5) + $this->estimateImageInputTokens($imageAttachments));
    }

    private function estimateImageInputTokens(array $imageAttachments): int
    {
        return count($imageAttachments) * 1100;
    }

    private function chatImageAttachments(Request $request): array
    {
        $raw = $request->input('imageAttachments', []);
        if ($raw === null || $raw === '') {
            return [];
        }
        if (! is_array($raw) || count($raw) > 3) {
            abort(response()->json(['ok' => false, 'error' => 'Attach up to 3 images per chat message.'], 422));
        }

        $images = [];
        foreach ($raw as $item) {
            if (! is_array($item)) {
                abort(response()->json(['ok' => false, 'error' => 'Image attachments are malformed.'], 422));
            }
            $url = trim((string) ($item['url'] ?? $item['dataUrl'] ?? ''));
            $detail = strtolower(trim((string) ($item['detail'] ?? 'auto')));
            if (! in_array($detail, ['auto', 'low', 'high'], true)) {
                $detail = 'auto';
            }
            $mimeType = $this->validChatImageUrl($url);
            $images[] = [
                'url' => $url,
                'detail' => $detail,
                'mimeType' => $mimeType,
                'name' => Str::limit(trim((string) ($item['name'] ?? 'image')), 90, ''),
            ];
        }

        return $images;
    }

    private function validChatImageUrl(string $url): string
    {
        if ($url === '') {
            abort(response()->json(['ok' => false, 'error' => 'Image attachments must include image data.'], 422));
        }

        if (preg_match('/^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+\/=\r\n]+)$/i', $url, $match) === 1) {
            if (strlen($url) > 4500000) {
                abort(response()->json(['ok' => false, 'error' => 'That image is too large for chat. Attach a smaller image.'], 413));
            }
            $decoded = base64_decode(preg_replace('/\s+/', '', $match[2]), true);
            if ($decoded === false || strlen($decoded) > 3000000 || ! $this->validImageMagicBytes($decoded, strtolower($match[1]))) {
                abort(response()->json(['ok' => false, 'error' => 'That image attachment is invalid. Use PNG, JPEG, WebP, or GIF.'], 422));
            }
            return 'image/'.(strtolower($match[1]) === 'jpg' ? 'jpeg' : strtolower($match[1]));
        }

        if (! str_starts_with($url, 'https://')) {
            abort(response()->json(['ok' => false, 'error' => 'Image attachments must be HTTPS URLs or bounded image data URLs.'], 422));
        }
        $parts = parse_url($url);
        $host = is_array($parts) ? strtolower((string) ($parts['host'] ?? '')) : '';
        if ($host === '' || isset($parts['user']) || isset($parts['pass']) || $host === 'localhost' || str_ends_with($host, '.local')) {
            abort(response()->json(['ok' => false, 'error' => 'Image URLs must be public HTTPS URLs.'], 422));
        }
        if (filter_var($host, FILTER_VALIDATE_IP) && ! filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            abort(response()->json(['ok' => false, 'error' => 'Image URLs must be public HTTPS URLs.'], 422));
        }
        return 'image';
    }

    private function validImageMagicBytes(string $bytes, string $type): bool
    {
        return match ($type) {
            'png' => str_starts_with($bytes, "\x89PNG\r\n\x1a\n"),
            'jpg', 'jpeg' => str_starts_with($bytes, "\xff\xd8\xff"),
            'gif' => str_starts_with($bytes, 'GIF87a') || str_starts_with($bytes, 'GIF89a'),
            'webp' => str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP',
            default => false,
        };
    }

    private function projectFilesContext(array $files): string
    {
        $lines = [];
        foreach (array_slice($files, 0, 300) as $item) {
            $path = is_array($item) ? trim((string) ($item['path'] ?? '')) : trim((string) $item);
            if ($path === '') {
                continue;
            }
            $path = str_replace(["\r", "\n"], ' ', Str::limit($path, 180, ''));
            $language = is_array($item) ? trim((string) ($item['language'] ?? '')) : '';
            $loaded = is_array($item) && ! empty($item['loaded']) ? ' loaded' : '';
            $meta = trim($language.$loaded);
            $lines[] = '- '.$path.($meta !== '' ? " ({$meta})" : '');
            $snippet = is_array($item) ? trim((string) ($item['snippet'] ?? '')) : '';
            if ($snippet !== '') {
                $snippet = str_replace(["\r\n", "\r"], "\n", Str::limit($snippet, 1200, ''));
                foreach (explode("\n", $snippet) as $snippetLine) {
                    $line = trim($snippetLine);
                    if ($line !== '') {
                        $lines[] = '  '.$line;
                    }
                }
            }
        }

        return Str::limit(implode("\n", $lines), 20000, '');
    }

    private function enforceChatRateLimit(Request $request, int $userId, string $plan): ?JsonResponse
    {
        $perMinute = (int) config("billing.plans.{$plan}.rate_per_minute", 12);
        $perHour = (int) config("billing.plans.{$plan}.rate_per_hour", 200);
        $perIp = self::CHAT_PER_IP_PER_MINUTE;

        $perMinuteKey = "chat:user:{$userId}:1m";
        $perHourKey = "chat:user:{$userId}:1h";
        $perIpKey = 'chat:ip:' . sha1((string) $request->ip()) . ':1m';

        $limits = [
            [$perMinuteKey, $perMinute, 60, 'You are sending messages too fast. Wait a moment and try again.'],
            [$perHourKey, $perHour, 3600, 'Hourly chat limit reached. Try again later.'],
            [$perIpKey, $perIp, 60, 'Too many chat requests from this network. Wait a moment and try again.'],
        ];

        foreach ($limits as [$key, $max, $window, $message]) {
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $retry = RateLimiter::availableIn($key);
                return $this->json([
                    'ok' => false,
                    'error' => $message,
                    'retryAfter' => $retry,
                ], 429);
            }
            RateLimiter::hit($key, $window);
        }

        return null;
    }

    private function resolveSkill(string $id): ?array
    {
        foreach ((array) config('skills.list', []) as $skill) {
            if (($skill['id'] ?? null) === $id) {
                return $skill;
            }
        }
        return null;
    }

    private function effectiveChatModelKey(string $modelKey, ?array $skill): string
    {
        $skillModelKey = trim((string) ($skill['model_key'] ?? ''));
        return $skillModelKey !== '' ? $skillModelKey : $modelKey;
    }

    private function normalizeReasoningEffort(string $value): string
    {
        $value = strtolower(trim($value));
        return in_array($value, ['none', 'low', 'medium', 'high', 'xhigh'], true) ? $value : 'medium';
    }

    private function buildReasoningPayload(string $effort, int $maxOutputTokens): ?array
    {
        if ($effort === 'none') {
            return ['exclude' => true];
        }
        if ($effort === 'xhigh') {
            return [
                'effort' => 'high',
                'max_tokens' => max($maxOutputTokens * 4, 8000),
            ];
        }
        return ['effort' => $effort];
    }

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

    private function resolveMaxTokens(Request $request, string $prompt, ?array $skill): int
    {
        if ($this->resolveChatMode($request, $prompt, $skill) === 'build') {
            return 3000;
        }
        $skillTokens = (int) ($skill['max_tokens'] ?? 0);
        if ($skillTokens > 0) {
            return max(800, min($skillTokens, 3000));
        }
        return 800;
    }

    private function webSearchTools(?array $skill): array
    {
        if (! (bool) ($skill['web_plugin'] ?? false)) {
            return [];
        }

        return [[
            'type' => 'openrouter:web_search',
            'parameters' => [
                'engine' => 'auto',
                'max_results' => 5,
                'max_total_results' => 10,
                'search_context_size' => 'medium',
            ],
        ]];
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

    private function isLocalPreviewHost(string $host): bool
    {
        $host = trim(strtolower($host), '[]');
        if (in_array($host, ['localhost', '0.0.0.0', '127.0.0.1', '::1'], true)) {
            return true;
        }
        if (preg_match('/^127\./', $host) === 1) {
            return true;
        }
        if (preg_match('/^10\./', $host) === 1) {
            return true;
        }
        if (preg_match('/^192\.168\./', $host) === 1) {
            return true;
        }
        if (preg_match('/^172\.(1[6-9]|2\d|3[0-1])\./', $host) === 1) {
            return true;
        }
        return false;
    }
}
