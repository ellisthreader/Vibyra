<?php

namespace App\Services\AgentRuns\Tools\Providers;

/** Small helpers shared by the V2 provider tool schemas and validators. */
final class Schema
{
    public static function tool(string $name, string $description, array $properties, array $required = []): array
    {
        return ['name' => $name, 'description' => $description, 'parameters' => ['type' => 'object',
            'properties' => $properties === [] ? new \stdClass : $properties, 'required' => $required,
            'additionalProperties' => false]];
    }

    /** Refuse any argument the schema does not name, so nothing unexpected is stored or forwarded. */
    public static function only(array $arguments, array $allowed): void
    {
        $extra = array_diff(array_keys($arguments), $allowed);
        abort_unless($extra === [], 422, 'Unexpected argument: '.implode(', ', array_slice($extra, 0, 3)).'.');
    }

    public static function page(array $arguments, string $key = 'page'): int
    {
        $page = $arguments[$key] ?? 1;
        abort_unless(is_int($page) && $page >= 1 && $page <= 100, 422, 'Page must be between 1 and 100.');
        return $page;
    }

    public static function pageToken(array $arguments): ?string
    {
        $token = $arguments['pageToken'] ?? null;
        abort_unless($token === null || (is_string($token) && preg_match('/^[A-Za-z0-9_\-.=~]{1,512}$/D', $token)),
            422, 'That page token is invalid. Use the nextPageToken from the previous result.');
        return $token;
    }

    public static function line(mixed $value, int $max, string $message): string
    {
        abort_unless(is_string($value) && trim($value) !== '' && mb_strlen($value) <= $max
            && !preg_match('/[\r\n]/', $value), 422, $message);
        return trim($value);
    }

    public static function text(mixed $value, int $max, string $message, bool $required = true): ?string
    {
        if (!$required && $value === null) return null;
        abort_unless(is_string($value) && ($required ? trim($value) !== '' : true) && mb_strlen($value) <= $max, 422, $message);
        return $value;
    }
}
