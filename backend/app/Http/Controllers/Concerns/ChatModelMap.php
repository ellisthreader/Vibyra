<?php

namespace App\Http\Controllers\Concerns;

trait ChatModelMap
{
    private const MODEL_MAP = [
        'auto' => 'openai/gpt-4o-mini',
        'gpt-5.6' => 'openai/gpt-5.6-sol',
        'gpt-5.6-sol' => 'openai/gpt-5.6-sol',
        'gpt-5.6-terra' => 'openai/gpt-5.6-terra',
        'gpt-5.6-luna' => 'openai/gpt-5.6-luna',
        'gpt-5.5' => 'openai/gpt-5.5',
        'gpt-5.4' => 'openai/gpt-5.4',
        'gpt-5.4-mini' => 'openai/gpt-5.4-mini',
        'gpt-5.4-nano' => 'openai/gpt-5.4-nano',
        'gpt-5-codex' => 'openai/gpt-4.1',
        'claude-opus-5' => 'anthropic/claude-opus-5',
        'claude-opus-5-fast' => 'anthropic/claude-opus-5-fast',
        'claude-sonnet-5' => 'anthropic/claude-sonnet-5',
        'claude-fable-5.1' => 'anthropic/claude-fable-5.1',
        'claude-fable-5-1' => 'anthropic/claude-fable-5.1',
        'claude-fable-5' => 'anthropic/claude-fable-5',
        'claude-opus-4' => 'anthropic/claude-opus-4.8',
        'claude-sonnet-4' => 'anthropic/claude-sonnet-4.6',
        'claude-3-5-haiku' => 'anthropic/claude-haiku-4.5',
        'claude-haiku-4-5' => 'anthropic/claude-haiku-4.5',
        'gemini-2.5-pro' => 'google/gemini-2.5-pro',
        'gemini-2.5-flash' => 'google/gemini-2.5-flash',
        'gemini-2.0-flash' => 'google/gemini-3.5-flash',
    ];

    private function resolveOpenRouterModel(string $model): string
    {
        return self::MODEL_MAP[$model] ?? self::MODEL_MAP['auto'];
    }

    private function isKnownModelKey(string $model): bool
    {
        return array_key_exists($model, self::MODEL_MAP);
    }

    private function creditCost(string $model): int
    {
        $model = strtolower($model);

        if (str_contains($model, 'mini') || str_contains($model, 'nano') || str_contains($model, 'haiku') || str_contains($model, 'flash')) {
            return 1;
        }

        if (str_contains($model, 'opus') || str_contains($model, 'pro') || str_contains($model, 'codex') || str_contains($model, '5.6-sol') || str_contains($model, '5.5')) {
            return 6;
        }

        if (str_contains($model, 'sonnet') || str_contains($model, '5.6') || str_contains($model, '5.4')) {
            return 4;
        }

        return 2;
    }
}
