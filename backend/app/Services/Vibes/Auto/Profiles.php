<?php

namespace App\Services\Vibes\Auto;

/**
 * What each curated model is for, as three strengths and a set of affinities:
 *
 *   r - reasoning: how well it holds a hard problem together
 *   c - coding:    how well it writes and edits real source
 *   x - context:   how much it can keep in view at once
 *   a - affinity:  the kinds of work it is specifically preferred for
 *
 * These are **routing preferences, not benchmark results**. Each one is read off
 * the blurb the catalogue already publishes for that model - "Huge context for
 * whole-project questions", "Tuned for editing existing source files" - so the
 * router and the picker are telling a person the same thing about the same model.
 * When a blurb in `config/vibes.php` changes, the profile beside it should change
 * too; that is the maintenance contract, and it is why no number here claims to be
 * a measurement.
 *
 * A curated model with no entry is not an error. `derive()` builds a profile from
 * the model's live price and context window instead, so adding a model to the
 * config gets it routed sensibly on the same day rather than making Auto ignore it.
 */
final class Profiles
{
    private const PROFILES = [
        'openai/gpt-6-astra' => ['r' => 0.97, 'c' => 0.92, 'x' => 0.85, 'a' => ['math' => 0.12, 'analysis' => 0.08]],
        'anthropic/claude-opus-5' => ['r' => 0.94, 'c' => 0.96, 'x' => 0.92, 'a' => ['code' => 0.12, 'frontend' => 0.06]],
        'anthropic/claude-sonnet-5' => ['r' => 0.85, 'c' => 0.90, 'x' => 0.88, 'a' => ['code' => 0.10, 'frontend' => 0.08]],
        'google/gemini-3.8-pro' => ['r' => 0.88, 'c' => 0.82, 'x' => 0.99, 'a' => ['analysis' => 0.10, 'frontend' => 0.06]],
        'x-ai/grok-4.6' => ['r' => 0.86, 'c' => 0.84, 'x' => 0.78, 'a' => ['debug' => 0.12]],
        'openai/gpt-5.6-luna' => ['r' => 0.78, 'c' => 0.78, 'x' => 0.72, 'a' => []],
        'deepseek/deepseek-v4-pro-0813' => ['r' => 0.86, 'c' => 0.85, 'x' => 0.74, 'a' => ['math' => 0.08, 'code' => 0.06]],
        'moonshotai/kimi-k2.7-code' => ['r' => 0.70, 'c' => 0.87, 'x' => 0.76, 'a' => ['code' => 0.14]],
        'minimax/minimax-m3' => ['r' => 0.60, 'c' => 0.62, 'x' => 0.85, 'a' => []],
        'z-ai/glm-5' => ['r' => 0.68, 'c' => 0.73, 'x' => 0.70, 'a' => ['ops' => 0.08]],
        'mistralai/devstral-2512' => ['r' => 0.60, 'c' => 0.79, 'x' => 0.80, 'a' => ['code' => 0.12]],
        'google/gemini-3.8-flash' => ['r' => 0.62, 'c' => 0.63, 'x' => 0.86, 'a' => []],
        'qwen/qwen3.8-flash' => ['r' => 0.50, 'c' => 0.55, 'x' => 0.62, 'a' => []],
        'anthropic/claude-haiku-4.5' => ['r' => 0.61, 'c' => 0.71, 'x' => 0.72, 'a' => ['code' => 0.06]],
        'x-ai/grok-4.6-fast' => ['r' => 0.58, 'c' => 0.58, 'x' => 0.66, 'a' => ['debug' => 0.06]],
        'openai/gpt-5.6-luna-mini' => ['r' => 0.55, 'c' => 0.57, 'x' => 0.64, 'a' => []],
        'meta-llama/llama-4-maverick' => ['r' => 0.55, 'c' => 0.56, 'x' => 0.80, 'a' => []],
        'deepseek/deepseek-chat-v3.1' => ['r' => 0.62, 'c' => 0.69, 'x' => 0.70, 'a' => ['code' => 0.06]],
        'qwen/qwen3-coder' => ['r' => 0.50, 'c' => 0.71, 'x' => 0.68, 'a' => ['code' => 0.10]],
        'openai/gpt-oss-120b' => ['r' => 0.66, 'c' => 0.63, 'x' => 0.66, 'a' => []],
        'moonshotai/kimi-k2' => ['r' => 0.58, 'c' => 0.63, 'x' => 0.72, 'a' => ['code' => 0.06]],
        'mistralai/mistral-small-3.2-24b-instruct' => ['r' => 0.45, 'c' => 0.50, 'x' => 0.58, 'a' => []],
    ];

    /**
     * @return array{r: float, c: float, x: float, a: array<string, float>}
     */
    public static function of(string $id, ?int $contextLength = null, float $outputPerMillion = 0.0): array
    {
        $profile = self::PROFILES[$id] ?? self::derive($outputPerMillion);
        // The live window overrides a written one wherever the snapshot reports it:
        // a provider that widens a context window should be routed on the new number,
        // not on what was true when the profile was typed.
        if ($contextLength !== null && $contextLength > 0) {
            $profile['x'] = max($profile['x'], self::window($contextLength));
        }

        return $profile;
    }

    public static function known(string $id): bool
    {
        return isset(self::PROFILES[$id]);
    }

    /**
     * A profile for a model nobody has written one for. Price is the only honest
     * proxy available - providers charge roughly in proportion to model size, and
     * the whole catalogue is priced on one scale - so it is used as one, with a
     * deliberately narrow range. The result is close enough to route a new model
     * reasonably and never confident enough to beat a written profile of equal cost.
     */
    private static function derive(float $outputPerMillion): array
    {
        $strength = $outputPerMillion <= 0.0
            ? 0.55
            : max(0.40, min(0.88, 0.40 + 0.20 * log10(max(0.05, $outputPerMillion) / 0.15)));

        return ['r' => round($strength, 3), 'c' => round($strength, 3), 'x' => 0.65, 'a' => []];
    }

    /**
     * A context window as a proportion, scaled so a million tokens reads as full and
     * 128k as somewhat over half. An earlier curve saturated by 256k, which made
     * every model in the catalogue look equally wide and left the breadth axis with
     * nothing to choose between them.
     */
    private static function window(int $tokens): float
    {
        return max(0.0, min(1.0, log10($tokens / 8000.0 + 1.0) / log10(126.0)));
    }
}
