<?php

namespace App\Http\Controllers\Concerns;

trait CodexResponsesInputNormalization
{
    private function normalizeCodexFunctionCallIds(mixed $input): mixed
        {
            if (! is_array($input)) {
                return $input;
            }
            foreach ($input as $index => $item) {
                if (! is_array($item)
                    || ! in_array($item['type'] ?? null, ['function_call', 'function_call_output'], true)
                    || trim((string) ($item['call_id'] ?? '')) !== '') {
                    continue;
                }
                $id = trim((string) ($item['id'] ?? ''));
                if ($id !== '') {
                    $input[$index]['call_id'] = $id;
                }
            }
            return $input;
        }
    private function normalizeCodexToolSchemas(mixed $tools): mixed
        {
            if (! is_array($tools)) {
                return $tools;
            }
            foreach ($tools as $index => $tool) {
                if (! is_array($tool) || ($tool['type'] ?? null) !== 'function') {
                    continue;
                }
                $tools[$index]['parameters'] = $this->normalizeCodexSchemaValue(
                    $tool['parameters'] ?? []
                );
            }
            return $tools;
        }
    private function normalizeCodexSchemaValue(mixed $value, ?string $key = null): mixed
        {
            if (! is_array($value)) {
                return $value;
            }
            if ($value === [] && in_array($key, [
                'parameters',
                'properties',
                'patternProperties',
                'definitions',
                '$defs',
                'dependentSchemas',
            ], true)) {
                return (object) [];
            }
            foreach ($value as $childKey => $childValue) {
                $value[$childKey] = $this->normalizeCodexSchemaValue(
                    $childValue,
                    is_string($childKey) ? $childKey : null
                );
            }
            return $value;
        }
}
