<?php
namespace App\Services\AgentBrowser;
use App\Services\AgentRuns\Tools\Providers\Schema;
final class FileContent
{
    public const MAX = 8 * 1024 * 1024;
    public const MIMES = ['application/pdf', 'text/plain', 'text/csv', 'application/json', 'image/png', 'image/jpeg', 'image/webp'];
    public static function validate(array $args): array
    {
        Schema::only($args, ['generation', 'actionId', 'name', 'mimeType', 'contentBase64', 'sha256']);
        $name = Schema::line($args['name'] ?? null, 120, 'Name the downloaded file.');
        abort_if(preg_match('/[\\x00-\\x1f\\x7f]/', $name) || str_contains($name, '/') || str_contains($name, chr(92)), 422, 'Use an ordinary filename.');
        $mime = $args['mimeType'] ?? null;
        abort_unless(in_array($mime, self::MIMES, true), 422, 'This file type is not supported.');
        $encoded = $args['contentBase64'] ?? null;
        abort_unless(is_string($encoded) && strlen($encoded) <= 4 * (int) ceil(self::MAX / 3), 422, 'The file exceeds 8 MB.');
        $bytes = base64_decode($encoded, true);
        abort_unless(is_string($bytes) && strlen($bytes) > 0 && strlen($bytes) <= self::MAX
            && base64_encode($bytes) === $encoded, 422, 'Provide one bounded, valid file.');
        $sha = $args['sha256'] ?? null;
        abort_unless(is_string($sha) && preg_match('/\A[a-f0-9]{64}\z/D', $sha) && hash_equals(hash('sha256', $bytes), $sha), 422, 'The file hash does not match.');
        self::inspect($bytes, $mime);
        return [$name, $mime, $bytes, $sha];
    }
    private static function inspect(string $bytes, string $mime): void
    {
        if (str_starts_with($mime, 'image/')) {
            $image = @getimagesizefromstring($bytes);
            abort_unless(is_array($image) && ($image['mime'] ?? '') === $mime && $image[0] > 0 && $image[1] > 0
                && $image[0] * $image[1] <= 40_000_000, 422, 'The image does not match its type or bound.');
            return;
        }
        if ($mime === 'application/pdf') {
            abort_unless(str_starts_with($bytes, '%PDF-') && str_contains(substr($bytes, -2048), '%%EOF'), 422, 'The file is not a complete PDF.');
            return;
        }
        abort_unless(mb_check_encoding($bytes, 'UTF-8') && !str_contains($bytes, "\0")
            && !preg_match('/<\s*(?:!doctype|html|script|svg)\b/i', $bytes)
            && !str_starts_with($bytes, 'MZ') && !str_starts_with($bytes, "PK\x03\x04"), 422, 'Only plain text data is supported.');
        if ($mime === 'application/json') { json_decode($bytes); abort_unless(json_last_error() === JSON_ERROR_NONE, 422, 'The file is not valid JSON.'); }
    }
}
