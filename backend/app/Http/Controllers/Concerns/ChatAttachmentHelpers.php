<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait ChatAttachmentHelpers
{
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

}
