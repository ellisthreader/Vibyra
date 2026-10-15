<?php

namespace App\Services\Privacy;

/**
 * Keeps credentials out of the "Download my data" archive. Sections read named columns only, so a new secret column never
 * reaches the archive by accident; this is the second net for free-form content (client app state, chat text, briefs):
 * keys that name a credential are dropped and token-shaped strings are replaced.
 */
final class ExportScrub
{
    private const KEY = '/secret|token|passw|credential|api_?key|authoriz|cookie|private|signature|bearer|session|proof|nonce/i';
    private const VALUE = '/-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)'
        .'|\\b(?:vyk|sk|pk|rk|ghp|gho|ghu|ghs|xox[abprs]|glpat)[_-][A-Za-z0-9_\\-]{16,}'
        .'|\\bgithub_pat_[A-Za-z0-9_]{16,}|\\b(?:AIza|AKIA|ASIA)[A-Za-z0-9_\\-]{16,}'
        .'|\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}'
        .'|\\bBearer\\s+[A-Za-z0-9._~+\\/=-]{16,}/i';
    public const REMOVED = '[removed]';

    public static function text(?string $value): ?string
    {
        return $value === null ? null : (preg_replace(self::VALUE, self::REMOVED, $value) ?? self::REMOVED);
    }

    public static function clean(mixed $value, int $depth = 0): mixed
    {
        if (is_string($value)) return self::text($value);
        if (!is_array($value)) return is_scalar($value) || $value === null ? $value : null;
        if ($depth > 8) return null;
        $out = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && preg_match(self::KEY, $key)) continue;
            $out[$key] = self::clean($item, $depth + 1);
        }
        return $out;
    }
}
