<?php

namespace App\Services\Vibes\Auto;

use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Vibes\Catalog;
use App\Services\Vibes\TurnPrice;

/** One snapshot per decision, including price, tools, vision and effort metadata. */
final class Candidates
{
    public function __construct(private readonly Catalog $catalog, private readonly OpenRouterPricingCatalog $pricing) {}

    public function for(Situation $situation, ?array $models = null): array
    {
        $snapshot = $this->pricing->all();
        $rows = [];
        foreach ($models ?? (array) config('vibes_auto.models') as $id) {
            $model = $snapshot[$id] ?? null;
            $price = is_array($model) ? ($model['pricing'] ?? null) : null;
            if (! Profiles::known($id) || ! is_array($price)) continue;
            foreach (['prompt', 'completion'] as $key) {
                if (! isset($price[$key]) || ! is_numeric($price[$key]) || ! is_finite((float) $price[$key]) || (float) $price[$key] < 0) continue 2;
            }
            if ($this->catalog->hidden($id, $model, $snapshot)) continue;
            $trial = $this->catalog->includedFree($id, $price);
            if ($situation->trialOnly && ! $trial) continue;
            if ($situation->needsTools && ! in_array('tools', $model['supported_parameters'] ?? [], true)) continue;
            if ($situation->needsVision && ! in_array('image', $model['input_modalities'] ?? [], true)) continue;
            $row = ['id' => $id, 'price' => $price, 'model' => $model,
                'budget' => $trial ? $situation->budget : min($situation->budget, $situation->paidBudget ?? $situation->budget),
                'efforts' => Ladder::ordered(Catalog::supportedEfforts($model['reasoning'] ?? null))];
            // If even the lowest effort cannot fit, no scoring preference can save it.
            if (! self::fits($row, $situation->inputBound, $row['efforts'][0] ?? null)) continue;
            $rows[] = $row;
        }
        return $rows;
    }

    public static function fits(array $candidate, int $input, ?string $effort): bool
    {
        $context = $candidate['model']['context_length'] ?? null;
        return ! is_numeric($context) || (int) $context <= 0
            || $input + TurnPrice::outputTokens($effort) <= (int) $context;
    }
}
