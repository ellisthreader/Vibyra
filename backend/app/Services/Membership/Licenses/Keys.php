<?php

namespace App\Services\Membership\Licenses;

final class Keys
{
    public static function generate(): string
    {
        return 'VPRO-'.implode('-', str_split(strtoupper(bin2hex(random_bytes(32))), 8));
    }

    public static function hash(mixed $key): ?string
    {
        if (!is_string($key) || strlen($key) > 100) return null;
        $key = strtoupper(str_replace(['-', ' ', "\r", "\n", "\t"], '', $key));
        if (!preg_match('/\AVPRO[0-9A-F]{64}\z/D', $key)) return null;
        return hash('sha256', $key);
    }
}
