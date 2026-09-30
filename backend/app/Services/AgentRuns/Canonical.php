<?php

namespace App\Services\AgentRuns;

/** Stable JSON for hashes: object keys sorted recursively, lists kept in order. */
final class Canonical
{
    public static function json(mixed $value): string
    {
        return json_encode(self::sort($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public static function hash(mixed $value): string
    {
        return hash('sha256', self::json($value));
    }

    private static function sort(mixed $value): mixed
    {
        if (!is_array($value)) return $value;
        if (!array_is_list($value)) ksort($value, SORT_STRING);
        return array_map([self::class, 'sort'], $value);
    }
}
