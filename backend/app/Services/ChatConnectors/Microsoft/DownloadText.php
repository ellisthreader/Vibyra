<?php

namespace App\Services\ChatConnectors\Microsoft;

use Illuminate\Support\Facades\Http;

final class DownloadText
{
    public function fetch(array $item): array
    {
        $mime = strtolower((string) ($item['file']['mimeType'] ?? ''));
        $name = strtolower((string) ($item['name'] ?? ''));
        $isText = str_starts_with($mime, 'text/') || in_array($mime, ['application/json', 'application/xml'], true)
            || preg_match('/\.(txt|md|csv|json|xml)$/D', $name);
        abort_unless($isText && is_numeric($item['size'] ?? null) && (int) $item['size'] <= 1048576,
            422, 'Only text files up to 1 MB can be read.');
        $download = $item['@microsoft.graph.downloadUrl'] ?? null;
        $host = is_string($download) ? strtolower((string) parse_url($download, PHP_URL_HOST)) : '';
        $allowed = $host !== '' && (str_ends_with($host, '.sharepoint.com')
            || str_ends_with($host, '.1drv.com') || str_ends_with($host, '.onedrive.com'));
        abort_unless($allowed && parse_url($download, PHP_URL_SCHEME) === 'https',
            422, 'Microsoft did not provide a trusted download URL.');
        // The signed URL needs no bearer token. Never forward the Graph token or
        // follow a redirect from a provider file host to an arbitrary endpoint.
        $response = Http::withoutRedirecting()->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->get($download);
        abort_unless($response->successful(), 422, 'Microsoft could not return this file safely.');
        $body = $response->body();
        abort_unless(strlen($body) <= 1048576 && mb_check_encoding($body, 'UTF-8'),
            422, 'This text file is too large or has unsupported encoding.');
        return ['text' => mb_substr($body, 0, 16000), 'truncated' => mb_strlen($body) > 16000];
    }
}
