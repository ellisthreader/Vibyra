<?php

namespace App\Services\ChatConnectors\Figma;

use Illuminate\Support\Facades\Http;

/**
 * One request against api.figma.com, on the account's own OAuth token. Shaped
 * after Github\Client: a per-turn time budget so a slow or chatty read cannot
 * eat the whole job timeout, and status codes mapped to a sentence the model
 * can pass straight to the person rather than a raw HTTP code.
 */
final class Client
{
    private const BASE = 'https://api.figma.com/v1';

    private static ?float $deadline = null;

    public static function endBatch(): void { self::$deadline = null; }

    public static function beginBatch(): void { self::$deadline = microtime(true) + 10; }

    public static function remaining(): float { return self::$deadline === null ? 8 : max(0, min(8, self::$deadline - microtime(true))); }

    public function get(string $token, string $path, array $query = []): array
    {
        $remaining = self::remaining();
        if ($remaining < 0.2) return ['error' => 'Figma read time budget reached. Coverage is partial; continue in another message.'];
        try {
            $r = Http::withToken($token)->acceptJson()->timeout($remaining)
                ->get(self::BASE.$path, $query);
            if (!$r->successful()) return ['error' => match ($r->status()) {
                401 => 'Figma access expired or was revoked. Reconnect Figma.',
                403 => 'Figma refused access to this file. Check the account can open it.',
                404 => 'This Figma file or node was not found, or this connection cannot access it.',
                429 => 'Figma rate-limited this request. Retry in a moment.',
                default => 'Figma could not return this resource. Retry later.',
            }, 'status' => $r->status()];
            $data = $r->json();
            if (!is_array($data)) return ['error' => 'Figma returned an unreadable response.'];
            return ['data' => $data];
        } catch (\Throwable) { return ['error' => 'Figma did not respond in time. Retry later.']; }
    }

    public static function clip(?string $text, int $limit = 2000): ?string
    {
        return $text === null ? null : mb_strcut($text, 0, $limit, 'UTF-8');
    }
}
