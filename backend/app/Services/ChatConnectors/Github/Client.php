<?php

namespace App\Services\ChatConnectors\Github;

use Illuminate\Support\Facades\Http;

final class Client
{
    private static ?float $deadline = null;

    public static function endBatch(): void { self::$deadline = null; }

    public static function beginBatch(): void { self::$deadline = microtime(true) + 10; }

    public static function remaining(): float { return self::$deadline === null ? 8 : max(0, min(8, self::$deadline - microtime(true))); }

    public function get(string $token, string $path, array $query = []): array
    {
        $remaining = self::remaining();
        if ($remaining < 0.2) return ['error' => 'GitHub read time budget reached. Coverage is partial; continue in another message.'];
        try {
            $r = Http::withToken($token)->acceptJson()->timeout($remaining)->withOptions(['allow_redirects' => false])
                ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28'])
                ->get('https://api.github.com'.$path, $query);
            if (!$r->successful()) return ['error' => match ($r->status()) {
                401 => 'GitHub access expired or was revoked. Reconnect GitHub.',
                403, 429 => 'GitHub refused access or rate-limited this request. Check repository/organization access or retry later.',
                404 => 'This GitHub resource was not found or this connection cannot access it.',
                default => 'GitHub could not return this resource. Retry later.',
            }, 'status' => $r->status()];
            $data = $r->json();
            if (!is_array($data)) return ['error' => 'GitHub returned an unreadable response.'];
            return ['data' => $data, 'hasMore' => str_contains($r->header('Link') ?? '', 'rel="next"')];
        } catch (\Throwable) { return ['error' => 'GitHub did not respond in time. Retry later.']; }
    }

    public static function path(string $repository): string
    {
        return '/repos/'.implode('/', array_map('rawurlencode', explode('/', $repository)));
    }

    public static function clip(?string $text, int $limit = 2000): ?string
    {
        return $text === null ? null : mb_strcut($text, 0, $limit, 'UTF-8');
    }
}
