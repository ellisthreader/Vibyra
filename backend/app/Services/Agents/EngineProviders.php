<?php

namespace App\Services\Agents;

final class EngineProviders
{
    public const IDS = ['openai', 'anthropic', 'google', 'x-ai', 'deepseek'];

    public static function preference(string $value): ?string
    {
        if (!str_starts_with($value, 'provider:')) return null;
        $provider = substr($value, 9);
        abort_unless(in_array($provider, self::IDS, true), 422, 'Choose an available AI provider.');
        return $provider;
    }
}
