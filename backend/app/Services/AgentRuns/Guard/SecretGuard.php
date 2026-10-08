<?php

namespace App\Services\AgentRuns\Guard;

/**
 * Finds and masks common secrets in text that is about to reach a model, a notification or an export (roadmap Part 16).
 * Pure functions, no I/O, and the same behaviour as the Rust twin on the Mac; docs/secret-guard-vectors.json holds both
 * to it, false positives included. A redaction reads `[redacted:<kind>]` and never keeps any part of the secret.
 */
final class SecretGuard
{
    public const MAX_BYTES = 1000000;

    public static function enabled(): bool
    {
        return (bool) config('agent_depth.secret_guard');
    }

    /** @return string[] the kinds found, first occurrence first */
    public static function scan(string $text): array
    {
        $kinds = [];
        self::run($text, $kinds);
        return array_values(array_unique($kinds));
    }

    public static function redact(string $text): string
    {
        $kinds = [];
        return self::run($text, $kinds);
    }

    public static function contains(string $text): bool
    {
        return self::scan($text) !== [];
    }

    /** Strings are redacted; a secret-named key keeps its name and loses its value; everything else passes through. */
    public static function redactValue(mixed $value): mixed
    {
        if (is_string($value)) return self::redact($value);
        if (!is_array($value)) return $value;
        $out = [];
        foreach ($value as $key => $item) {
            $out[$key] = is_string($key) && is_string($item) && self::secretKey($key, $item) ? '[redacted:secret_assignment]' : self::redactValue($item);
        }
        return $out;
    }

    /** @return string[] */
    public static function kindsIn(mixed $value): array
    {
        $kinds = [];
        self::collect($value, $kinds);
        return array_values(array_unique($kinds));
    }

    private static function collect(mixed $value, array &$kinds): void
    {
        if (is_string($value)) { array_push($kinds, ...self::scan($value)); return; }
        if (!is_array($value)) return;
        foreach ($value as $key => $item) {
            if (is_string($key) && is_string($item) && self::secretKey($key, $item)) $kinds[] = 'secret_assignment';
            else self::collect($item, $kinds);
        }
    }

    private static function secretKey(string $key, string $value): bool
    {
        $class = SecretValues::nameClass($key);
        return $class === 'strong' && strlen($value) >= 8 && !SecretValues::placeholder($value);
    }

    private static function run(string $text, array &$kinds): string
    {
        $cut = strlen($text) > self::MAX_BYTES;
        if ($cut) $text = substr($text, 0, self::MAX_BYTES);
        foreach (SecretPatterns::TOKENS as [$kind, $pattern]) {
            $text = preg_replace_callback($pattern, function ($m) use ($kind, &$kinds) { $kinds[] = $kind; return '[redacted:'.$kind.']'; }, $text) ?? '';
        }
        foreach ([[SecretPatterns::BEARER, 'bearer_token'], [SecretPatterns::BASIC, 'basic_auth']] as [$pattern, $kind]) {
            $text = preg_replace_callback($pattern, function ($m) use ($kind, &$kinds) {
                if (!SecretValues::random($m[3])) return $m[0];
                $kinds[] = $kind;
                return $m[1].$m[2].'[redacted:'.$kind.']';
            }, $text) ?? '';
        }
        $text = preg_replace_callback(SecretPatterns::URL_PASSWORD, function ($m) use (&$kinds) {
            if (SecretValues::placeholder($m[2])) return $m[0];
            $kinds[] = 'url_password';
            return $m[1].'[redacted:url_password]'.$m[3];
        }, $text) ?? '';
        $subject = $text;
        $text = preg_replace_callback(SecretPatterns::PAIR, function ($m) use ($subject, &$kinds) {
            [$name, $sep, $value] = [$m[1][0], $m[2][0], $m[3][0]];
            $class = SecretValues::nameClass($name);
            $next = $subject[$m[0][1] + strlen($m[0][0])] ?? '';
            if ($class === null || $next === '(') return $m[0][0];
            $trail = '';
            while (str_ends_with($value, '.')) { $trail .= '.'; $value = substr($value, 0, -1); }
            if (!SecretValues::accept($class, $name === strtoupper($name), $value)) return $m[0][0];
            $kinds[] = 'secret_assignment';
            return $name.$sep.'[redacted:secret_assignment]'.$trail;
        }, $text, -1, $count, PREG_OFFSET_CAPTURE) ?? '';
        return $cut ? $text.'[redacted:truncated]' : $text;
    }
}
