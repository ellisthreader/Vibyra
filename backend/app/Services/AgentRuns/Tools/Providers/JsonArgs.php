<?php

namespace App\Services\AgentRuns\Tools\Providers;

/**
 * A bounded check of tool arguments against a third-party JSON Schema (remote MCP
 * servers, Composio). It enforces the top level only: an object, required keys,
 * only declared keys (whenever the schema lists any), scalar types and enums, and a
 * size cap. Deeper validation is the remote server's job; what the person
 * approves is always the exact canonical arguments sent.
 */
final class JsonArgs
{
    private const MAX_BYTES = 16000;
    private const TYPES = ['string' => 'is_string', 'integer' => 'is_int', 'boolean' => 'is_bool', 'array' => 'array_is_list',
        'object' => 'is_array'];

    public static function check(array $schema, array $arguments): array
    {
        abort_unless(strlen((string) json_encode($arguments)) <= self::MAX_BYTES, 422, 'Those arguments are too large.');
        $properties = is_array($schema['properties'] ?? null) ? $schema['properties'] : [];
        $required = array_values(array_filter((array) ($schema['required'] ?? []), 'is_string'));
        $missing = array_diff($required, array_keys($arguments));
        abort_unless($missing === [], 422, 'Missing argument: '.implode(', ', array_slice($missing, 0, 3)).'.');
        if (($schema['additionalProperties'] ?? true) === false || $properties !== [])
            Schema::only($arguments, array_keys($properties));
        foreach ($arguments as $key => $value) {
            $rule = is_array($properties[$key] ?? null) ? $properties[$key] : [];
            $type = $rule['type'] ?? null;
            if (is_string($type)) abort_unless(self::is($type, $value), 422, 'Argument '.$key.' must be '.$type.'.');
            if (is_array($rule['enum'] ?? null)) abort_unless(in_array($value, $rule['enum'], true), 422, 'Argument '.$key.' is not an allowed value.');
            if (is_int($value) || is_float($value)) {
                abort_if(isset($rule['minimum']) && $value < $rule['minimum'], 422, 'Argument '.$key.' is too small.');
                abort_if(isset($rule['maximum']) && $value > $rule['maximum'], 422, 'Argument '.$key.' is too large.');
            }
        }
        return $arguments;
    }

    /** A schema the model can be given: an object schema with bounded size, or null when unusable. */
    public static function schema(mixed $schema): ?array
    {
        if (!is_array($schema) || ($schema['type'] ?? 'object') !== 'object') return null;
        return strlen((string) json_encode($schema)) <= 8000 ? $schema + ['type' => 'object'] : null;
    }

    private static function is(string $type, mixed $value): bool
    {
        if ($type === 'number') return is_int($value) || is_float($value);
        if ($type === 'null') return $value === null;
        if ($type === 'object') return is_array($value) && ($value === [] || !array_is_list($value));
        $check = self::TYPES[$type] ?? null;
        return $check === null || ($type === 'array' ? is_array($value) && array_is_list($value) : $check($value));
    }
}
