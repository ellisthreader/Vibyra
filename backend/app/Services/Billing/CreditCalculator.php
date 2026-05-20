<?php

namespace App\Services\Billing;

class CreditCalculator
{
    public function modelConfig(string $modelKey): ?array
    {
        $models = (array) config('billing.models', []);
        return $models[$modelKey] ?? null;
    }

    public function resolveSlug(string $modelKey): string
    {
        $config = $this->modelConfig($modelKey) ?? $this->modelConfig('auto');
        return (string) ($config['slug'] ?? 'openai/gpt-4o-mini');
    }

    public function tier(string $modelKey): string
    {
        $config = $this->modelConfig($modelKey) ?? $this->modelConfig('auto');
        return (string) ($config['tier'] ?? 'budget');
    }

    public function planAllowsModel(string $plan, string $modelKey): bool
    {
        $tier = $this->tier($modelKey);
        $allowed = (array) config("billing.plans.{$plan}.allowed_tiers", []);
        return in_array($tier, $allowed, true);
    }

    /**
     * Estimate the credit cost from input character/token counts BEFORE we call OpenRouter,
     * so we can reject under-funded requests with a friendly error.
     */
    public function estimateCredits(string $modelKey, int $inputTokens, int $maxOutputTokens, bool $agentMode = false): int
    {
        $usd = $this->estimateUsd($modelKey, $inputTokens, $maxOutputTokens);
        return $this->usdToCredits($modelKey, $usd, $inputTokens + $maxOutputTokens, $agentMode);
    }

    public function estimateUsd(string $modelKey, int $inputTokens, int $outputTokens): float
    {
        $slug = $this->resolveSlug($modelKey);
        $fallbackPricing = (array) config('billing.fallback_pricing_per_million_usd', []);
        $pricing = (array) ($fallbackPricing[$slug] ?? $fallbackPricing['default'] ?? ['input' => 1.0, 'output' => 3.0]);
        $inputUsd = ($inputTokens / 1_000_000) * (float) ($pricing['input'] ?? 1.0);
        $outputUsd = ($outputTokens / 1_000_000) * (float) ($pricing['output'] ?? 3.0);
        return max(0.0, $inputUsd + $outputUsd);
    }

    /**
     * Final deduction is computed from real usage returned by OpenRouter.
     * Pass the totalCost (in USD) when OpenRouter sets a 'cost' field; otherwise pass 0
     * and we'll fall back to a token-count estimate using fallback_pricing.
     */
    public function actualCredits(
        string $modelKey,
        ?float $openRouterUsd,
        int $inputTokens,
        int $outputTokens,
        bool $agentMode = false
    ): array {
        $usd = $openRouterUsd !== null && $openRouterUsd > 0
            ? $openRouterUsd
            : $this->estimateUsd($modelKey, $inputTokens, $outputTokens);
        $totalTokens = $inputTokens + $outputTokens;
        $credits = $this->usdToCredits($modelKey, $usd, $totalTokens, $agentMode);
        return [
            'credits' => $credits,
            'usd' => $usd,
            'multiplier' => $this->effectiveMultiplier($modelKey, $totalTokens, $agentMode),
        ];
    }

    public function effectiveMultiplier(string $modelKey, int $totalTokens, bool $agentMode): float
    {
        $config = $this->modelConfig($modelKey) ?? $this->modelConfig('auto');
        $multiplier = (float) ($config['multiplier'] ?? 1.0);
        $longThreshold = (int) config('billing.surcharges.long_context_threshold_tokens', 100000);
        if ($totalTokens >= $longThreshold) {
            $multiplier *= (float) config('billing.surcharges.long_context_multiplier', 1.25);
        }
        if ($agentMode) {
            $multiplier *= (float) config('billing.surcharges.agent_mode_multiplier', 1.20);
        }
        return $multiplier;
    }

    private function usdToCredits(string $modelKey, float $usd, int $totalTokens, bool $agentMode): int
    {
        $multiplier = $this->effectiveMultiplier($modelKey, $totalTokens, $agentMode);
        $raw = $usd * 100.0 * $multiplier;
        $minimum = (int) config('billing.minimum_credit_charge', 1);
        return (int) max($minimum, ceil($raw));
    }
}
