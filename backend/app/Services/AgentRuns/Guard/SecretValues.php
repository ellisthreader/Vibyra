<?php

namespace App\Services\AgentRuns\Guard;

/** The judgement calls behind SecretGuard: does a name read as a secret, and does a value look like one. Mirrored in Rust. */
final class SecretValues
{
    /** 'strong' (a secret by name), 'weak' (key or auth on its own), or null. */
    public static function nameClass(string $name): ?string
    {
        $words = self::words($name);
        $last = end($words);
        if ($last === false) return null;
        if (in_array($last, SecretPatterns::STRONG, true)) return 'strong';
        if (!in_array($last, SecretPatterns::WEAK, true)) return null;
        $before = $words[count($words) - 2] ?? null;
        return $before !== null && in_array($before, SecretPatterns::PREFIX, true) ? 'strong' : 'weak';
    }

    /** @return string[] lowercase words: split on `_ . -` and on a lower/digit to upper step (`clientSecret` is client, secret) */
    public static function words(string $name): array
    {
        $words = [];
        $current = '';
        $previous = '';
        foreach (str_split($name) as $c) {
            if ($c === '_' || $c === '.' || $c === '-') { $words[] = $current; $current = ''; $previous = $c; continue; }
            $upper = $c >= 'A' && $c <= 'Z';
            $lowerOrDigit = ($previous >= 'a' && $previous <= 'z') || ($previous >= '0' && $previous <= '9');
            if ($upper && $current !== '' && $lowerOrDigit) { $words[] = $current; $current = ''; }
            $current .= $c;
            $previous = $c;
        }
        $words[] = $current;
        return array_values(array_filter(array_map('strtolower', $words), fn ($w) => $w !== ''));
    }

    public static function accept(string $class, bool $envStyle, string $value): bool
    {
        if (self::placeholder($value)) return false;
        $n = strlen($value);
        $classes = self::classes($value);
        $entropy = self::entropy($value);
        if ($class === 'strong') return $envStyle ? $n >= 8 : ($n >= 8 && ($classes >= 2 || $n >= 16) && $entropy >= 2.5);
        return $envStyle ? ($n >= 12 && $classes >= 2 && $entropy >= 3.0) : ($n >= 20 && $classes >= 2 && $entropy >= 3.5);
    }

    public static function placeholder(string $value): bool
    {
        $lower = strtolower($value);
        if (in_array($lower, SecretPatterns::PLACEHOLDER_WORDS, true) || in_array($value[0] ?? '', ['$', '%', '*'], true)) return true;
        foreach (SecretPatterns::PLACEHOLDER_PARTS as $part) if (str_contains($lower, $part)) return true;
        return count(array_unique(str_split($value))) <= 1;
    }

    /** A bearer or basic token worth masking: long, and not a plain word. */
    public static function random(string $token): bool
    {
        return strlen($token) >= 20 && self::classes($token) >= 2 && self::entropy($token) >= 3.0;
    }

    /** How many of lower case, upper case and digits appear. */
    public static function classes(string $value): int
    {
        return (preg_match('/[a-z]/', $value) ? 1 : 0) + (preg_match('/[A-Z]/', $value) ? 1 : 0) + (preg_match('/[0-9]/', $value) ? 1 : 0);
    }

    /** Shannon entropy in bits per byte. */
    public static function entropy(string $value): float
    {
        $n = strlen($value);
        if ($n === 0) return 0.0;
        $sum = 0.0;
        foreach (count_chars($value, 1) as $count) $sum -= ($count / $n) * log($count / $n, 2);
        return $sum;
    }
}
