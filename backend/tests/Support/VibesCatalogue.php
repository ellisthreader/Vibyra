<?php

namespace Tests\Support;

use Illuminate\Support\Facades\Cache;

/**
 * A realistic OpenRouter snapshot for the whole curated catalogue: the prices the
 * free-tier ceiling in `config/vibes.php` describes, the effort ladders each model
 * publishes, and the context window each one advertises.
 *
 * Auto is scored against live pricing, so a fixture that is merely *a* catalogue
 * proves nothing about the router's judgement. This one is shaped like the real
 * thing - nine models inside the free ceiling, two flagships an order of magnitude
 * dearer, only eight ladders among twenty-two models, and two curated ids the
 * provider does not serve at all.
 */
final class VibesCatalogue
{
    /** [input per million, output per million, context length, ladder, default, mandatory] */
    private const MODELS = [
        // The four flagships `config/vibes.php` names as the ones outside the free
        // ceiling, priced as that comment describes them.
        'openai/gpt-6-astra' => [10.00, 50.00, 400000, ['low', 'medium', 'high', 'xhigh', 'max'], 'medium', true],
        'anthropic/claude-opus-5' => [5.00, 25.00, 500000, ['low', 'medium', 'high', 'xhigh', 'max'], 'high', false],
        'anthropic/claude-sonnet-5' => [2.00, 10.00, 400000, ['low', 'medium', 'high', 'xhigh', 'max'], 'high', false],
        'x-ai/grok-4.6' => [1.20, 6.00, 256000, ['low', 'medium', 'high', 'xhigh'], 'high', true],
        // Everything below is inside it.
        'anthropic/claude-haiku-4.5' => [1.00, 5.00, 200000, null, null, false],
        'deepseek/deepseek-v4-pro-0813' => [0.90, 4.40, 164000, ['low', 'high', 'max'], 'high', false],
        'moonshotai/kimi-k2.7-code' => [0.90, 3.20, 256000, null, null, false],
        'z-ai/glm-5' => [0.60, 2.20, 200000, null, null, false],
        'google/gemini-3.8-flash' => [0.50, 3.75, 1000000, ['low', 'medium', 'high'], 'medium', true],
        'moonshotai/kimi-k2' => [0.50, 2.00, 131072, null, null, false],
        'mistralai/devstral-2512' => [0.40, 1.60, 262144, null, null, false],
        'minimax/minimax-m3' => [0.28, 1.15, 1000000, null, null, false],
        'openai/gpt-5.6-luna' => [0.25, 1.10, 262144, ['none', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium', false],
        'qwen/qwen3-coder' => [0.22, 0.95, 262144, null, null, false],
        'deepseek/deepseek-chat-v3.1' => [0.20, 0.80, 164000, null, null, false],
        'meta-llama/llama-4-maverick' => [0.16, 0.60, 1000000, null, null, false],
        'qwen/qwen3.8-flash' => [0.15, 0.47, 131072, null, null, false],
        'openai/gpt-5.6-luna-mini' => [0.06, 0.24, 131072, null, null, false],
        'mistralai/mistral-small-3.2-24b-instruct' => [0.05, 0.10, 131072, null, null, false],
        'openai/gpt-oss-120b' => [0.04, 0.17, 131072, ['low', 'medium', 'high'], 'medium', true],
    ];

    /**
     * Curated in `config/vibes.php` and not served by OpenRouter. Both are already
     * marked unavailable on the phone; Auto has to reach the same conclusion from
     * the snapshot alone, which is why they are absent here rather than priced.
     */
    public const UNSERVED = ['google/gemini-3.8-pro', 'x-ai/grok-4.6-fast'];

    public static function put(array $overrides = []): void
    {
        Cache::put((string) config('billing.openrouter_pricing.cache_key'),
            ['synced_at' => now()->toIso8601String(), 'models' => array_replace(self::models(), $overrides)]);
    }

    public static function models(): array
    {
        $models = [];
        foreach (self::MODELS as $id => [$in, $out, $context, $efforts, $default, $mandatory]) {
            $models[$id] = [
                'slug' => $id,
                'name' => $id,
                'pricing' => ['prompt' => self::perToken($in), 'completion' => self::perToken($out)],
                'supported_parameters' => $efforts === null ? ['tools'] : ['reasoning', 'tools'],
                'context_length' => $context,
                'created' => 1_780_000_000,
                'output_modalities' => ['text'],
                'reasoning' => $efforts === null ? null
                    : array_filter(['mandatory' => $mandatory, 'supported_efforts' => $efforts, 'default_effort' => $default],
                        static fn ($value) => $value !== null),
            ];
        }

        return $models;
    }

    /**
     * The models a free account's trial credit can fund, worked out from the ceiling
     * in `config/vibes.php` rather than from a list written here. The ceiling has
     * already moved once; a fixture with its own copy of it would have gone on
     * asserting the old answer while the code returned the new one.
     */
    public static function includedFree(): array
    {
        $ceiling = (array) config('vibes.free_tier');

        return array_keys(array_filter(self::MODELS,
            static fn (array $row) => $row[0] <= (float) $ceiling['input_per_million']
                && $row[1] <= (float) $ceiling['output_per_million']));
    }

    /** OpenRouter prices per single token, as a decimal string. */
    private static function perToken(float $perMillion): string
    {
        return rtrim(rtrim(number_format($perMillion / 1000000, 12, '.', ''), '0'), '.') ?: '0';
    }
}
