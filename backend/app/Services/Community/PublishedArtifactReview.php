<?php

namespace App\Services\Community;

/** Review the bytes that will be hosted; client source snapshots are only extra context. */
final class PublishedArtifactReview
{
    public static function collect(?array $hosted, ?array $runtime, mixed $source): array
    {
        $files = [];
        $incomplete = false;
        foreach ([$hosted, $runtime] as $bundle) {
            foreach ((array) ($bundle['files'] ?? []) as $file) {
                $body = (string) ($file['body'] ?? '');
                if (($file['encoding'] ?? 'utf8') === 'base64') {
                    $body = base64_decode($body, true);
                }
                $path = (string) ($file['path'] ?? '');
                if ($body === false || ! mb_check_encoding($body, 'UTF-8')) {
                    // Non-executable image/font/media bytes are not source code.
                    $incomplete = $incomplete || ! preg_match('/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp[34]|wav|ogg|webm)$/i', $path);
                    continue;
                }
                $files[] = ['path' => $path, 'language' => pathinfo($path, PATHINFO_EXTENSION), 'body' => $body];
            }
        }
        $files = [...$files, ...(is_array($source) ? $source : [])];
        $incomplete = $incomplete || count($files) > 80;
        foreach ($files as $file) {
            $incomplete = $incomplete || mb_strlen((string) ($file['body'] ?? '')) > 24000;
        }
        return ['files' => $files, 'incomplete' => $incomplete];
    }
}
