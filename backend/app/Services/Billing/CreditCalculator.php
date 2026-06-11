<?php

namespace App\Services\Billing;

class CreditCalculator
{
    public function __construct(private readonly OpenRouterPricingCatalog $pricingCatalog)
    {
    }

    public function modelConfig(string $modelKey): ?array
    {
        $models = (array) config('billing.models', []);
        return $models[$modelKey] ?? $this->dynamicOpenRouterModelConfig($modelKey);
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
        $usd = $this->estimateReservationUsd($modelKey, $inputTokens, $maxOutputTokens);
        return $this->usdToCredits($modelKey, $usd, $inputTokens + $maxOutputTokens, $agentMode);
    }

    public function estimateTerminalReservationCredits(
        string $modelKey,
        int $inputTokens,
        int $maxOutputTokens,
        bool $agentMode = true,
    ): int {
        $usd = $this->estimateTerminalReservationUsd($modelKey, $inputTokens, $maxOutputTokens);
        return $this->usdToCredits($modelKey, $usd, $inputTokens + $maxOutputTokens, $agentMode);
    }

    public function estimateUsageCredits(string $modelKey, int $inputTokens, int $outputTokens, bool $agentMode = false): int
    {
        $usd = $this->estimateUsd($modelKey, $inputTokens, $outputTokens);
        return $this->usdToCredits($modelKey, $usd, $inputTokens + $outputTokens, $agentMode);
    }

    public function estimateTerminalUsageCredits(
        string $modelKey,
        int $inputTokens,
        int $outputTokens,
        bool $agentMode = true,
    ): int {
        $usd = $this->estimateUsd($modelKey, $inputTokens, $outputTokens, false);
        return $this->usdToCredits($modelKey, $usd, $inputTokens + $outputTokens, $agentMode);
    }

    public function estimateReservationUsd(string $modelKey, int $inputTokens, int $outputTokens): float
    {
        $usd = $this->estimateUsd($modelKey, $inputTokens, $outputTokens);
        $safety = (float) config('billing.openrouter_pricing.reservation_safety_multiplier', 1.5);

        return max(0.0, $usd * max(1.0, $safety));
    }

    public function estimateTerminalReservationUsd(
        string $modelKey,
        int $inputTokens,
        int $outputTokens,
    ): float {
        $usd = $this->estimateUsd($modelKey, $inputTokens, $outputTokens, false);
        $safety = (float) config('billing.openrouter_pricing.reservation_safety_multiplier', 1.5);

        return max(0.0, $usd * max(1.0, $safety));
    }

    public function estimateUsd(
        string $modelKey,
        int $inputTokens,
        int $outputTokens,
        bool $applyDynamicModelSafety = true,
    ): float
    {
        $slug = $this->resolveSlug($modelKey);
        $livePricing = $this->pricingCatalog->freshPricingFor($slug);
        if (is_array($livePricing)) {
            $inputMicroUsd = $this->microUsdForUnits((string) ($livePricing['prompt'] ?? ''), $inputTokens);
            $outputMicroUsd = $this->microUsdForUnits((string) ($livePricing['completion'] ?? ''), $outputTokens);
            $requestMicroUsd = $this->microUsdForUnits((string) ($livePricing['request'] ?? ''), 1);
            $liveUsd = ($inputMicroUsd + $outputMicroUsd + $requestMicroUsd) / 1_000_000;
            $fallback = $this->fallbackEstimateForSlug($slug, $inputTokens, $outputTokens);

            if ($fallback !== null) {
                return max($liveUsd, $fallback);
            }

            return $liveUsd * ($applyDynamicModelSafety
                ? max(
                    1.0,
                    (float) config('billing.openrouter_pricing.dynamic_model_safety_multiplier', 2.0)
                )
                : 1.0);
        }

        return $this->fallbackEstimateForSlug($slug, $inputTokens, $outputTokens, true) ?? 0.0;
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
        bool $agentMode = false,
        float $fallbackCostMultiplier = 1.0,
    ): array {
        $usd = $openRouterUsd !== null && $openRouterUsd >= 0
            ? $openRouterUsd
            : $this->estimateUsd($modelKey, $inputTokens, $outputTokens) * max(1.0, $fallbackCostMultiplier);
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

    private function dynamicOpenRouterModelConfig(string $modelKey): ?array
    {
        $slug = trim($modelKey);
        if (! preg_match('/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i', $slug) || strlen($slug) > 140) {
            return null;
        }

        $pricing = $this->pricingCatalog->freshPricingFor($slug)
            ?? $this->pricingCatalog->refreshPricingFor($slug);
        if (! is_array($pricing)) {
            return null;
        }
        $tier = $this->dynamicTier($pricing);
        return [
            'slug' => $slug,
            'tier' => $tier,
            'multiplier' => match ($tier) {
                'free', 'budget' => 1.0,
                'balanced' => 1.15,
                default => 1.4,
            },
        ];
    }

    private function dynamicTier(array $pricing): string
    {
        $inputPerMillion = $this->microUsdForUnits((string) ($pricing['prompt'] ?? ''), 1_000_000) / 1_000_000;
        $outputPerMillion = $this->microUsdForUnits((string) ($pricing['completion'] ?? ''), 1_000_000) / 1_000_000;
        if ($inputPerMillion <= 0.0 && $outputPerMillion <= 0.0) {
            return 'free';
        }
        if ($outputPerMillion <= 5.0 && $inputPerMillion <= 1.0) {
            return 'budget';
        }
        return $outputPerMillion <= 20.0 && $inputPerMillion <= 5.0 ? 'balanced' : 'premium';
    }

    private function fallbackEstimateForSlug(
        string $slug,
        int $inputTokens,
        int $outputTokens,
        bool $includeDefault = false
    ): ?float {
        $fallbackPricing = (array) config('billing.fallback_pricing_per_million_usd', []);
        $pricing = $fallbackPricing[$slug] ?? ($includeDefault ? ($fallbackPricing['default'] ?? null) : null);
        if (! is_array($pricing)) {
            return null;
        }

        $inputUsd = ($inputTokens / 1_000_000) * (float) ($pricing['input'] ?? 0);
        $outputUsd = ($outputTokens / 1_000_000) * (float) ($pricing['output'] ?? 0);

        return max(0.0, $inputUsd + $outputUsd);
    }

    private function microUsdForUnits(string $usdPerUnit, int $units): int
    {
        if ($units <= 0 || ! is_numeric($usdPerUnit) || (float) $usdPerUnit < 0) {
            return 0;
        }

        return (int) ceil((float) $usdPerUnit * $units * 1_000_000);
    }
}
