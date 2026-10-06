<?php

namespace App\Services\Billing;

/**
 * Reviewed effort levels for models OpenRouter lists without any (`config/openrouter_reasoning.php`).
 * Applied when the catalogue is read, so the picker, launch validation, Auto and the request all
 * see the same levels, and a change to the list takes effect without waiting for a pricing sync.
 */
final class OpenRouterReasoning
{
    /** The catalogue with reviewed levels added wherever OpenRouter publishes none. */
    public static function apply(array $models): array
    {
        foreach ((array) config('openrouter_reasoning.models', []) as $id => $entry) {
            $reasoning = $models[$id]['reasoning'] ?? null;
            // OpenRouter's own list always wins; the review only fills a missing one.
            if (! is_array($reasoning) || array_key_exists('supported_efforts', $reasoning)) {
                continue;
            }
            $models[$id]['reasoning'] = [...$reasoning, 'supported_efforts' => $entry['efforts'],
                'default_effort' => $entry['default'], 'toggle' => (bool) ($entry['toggle'] ?? false)];
        }

        return $models;
    }

    /**
     * The OpenRouter `reasoning` body for a chosen level. A model that can only switch thinking
     * on or off is sent `enabled` rather than an effort its provider would not understand.
     */
    public static function request(?array $reasoning, string $effort): array
    {
        return ($reasoning['toggle'] ?? false) === true && $effort !== 'none'
            ? ['enabled' => true]
            : ['effort' => $effort];
    }
}
