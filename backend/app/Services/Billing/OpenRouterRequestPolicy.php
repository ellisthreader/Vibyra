<?php

namespace App\Services\Billing;

class OpenRouterRequestPolicy
{
    public function __construct(private readonly OpenRouterPricingCatalog $catalog)
    {
    }

    public function provider(string $modelKey, float $costMultiplier = 1.0): array
    {
        $slug = app(CreditCalculator::class)->resolveSlug($modelKey);
        $fallbacks = (array) config('billing.fallback_pricing_per_million_usd', []);
        $fallback = (array) ($fallbacks[$slug] ?? []);
        $live = $this->catalog->freshPricingFor($slug) ?? [];
        $dynamicSafety = max(1.0, (float) config(
            'billing.openrouter_pricing.dynamic_model_safety_multiplier',
            2.0
        ));
        $multiplier = max(1.0, $costMultiplier);

        $prompt = $this->maximum(
            $fallback['input'] ?? null,
            $this->perMillion($live['prompt'] ?? null, $fallback === [] ? $dynamicSafety : 1.0)
        );
        $completion = $this->maximum(
            $fallback['output'] ?? null,
            $this->perMillion($live['completion'] ?? null, $fallback === [] ? $dynamicSafety : 1.0)
        );
        $request = $this->numeric($live['request'] ?? null);

        $maxPrice = array_filter([
            'prompt' => $prompt !== null ? $prompt * $multiplier : null,
            'completion' => $completion !== null ? $completion * $multiplier : null,
            'request' => $request !== null ? $request * $multiplier : null,
        ], fn ($value) => $value !== null);

        return $maxPrice === [] ? [] : ['max_price' => $maxPrice];
    }

    private function perMillion(mixed $perToken, float $multiplier): ?float
    {
        $value = $this->numeric($perToken);
        return $value === null ? null : $value * 1_000_000 * $multiplier;
    }

    private function maximum(mixed $left, mixed $right): ?float
    {
        $values = array_filter([
            $this->numeric($left),
            $this->numeric($right),
        ], fn ($value) => $value !== null);

        return $values === [] ? null : max($values);
    }

    private function numeric(mixed $value): ?float
    {
        return is_numeric($value) && (float) $value >= 0 ? (float) $value : null;
    }
}
