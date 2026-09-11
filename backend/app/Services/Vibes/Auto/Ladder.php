<?php

namespace App\Services\Vibes\Auto;

use App\Services\Billing\OpenRouterPricingNormalizer;

/**
 * Which rung of a model's own reasoning ladder a demand lands on.
 *
 * Ladders are not comparable between models. Of the curated catalogue, fourteen
 * models publish no ladder at all and the correct effort for them is *no effort
 * key at all*; the rest publish between three and six rungs, and one model's
 * "medium" is another's top rung. So the demand is first placed on the canonical
 * seven-rung vocabulary every provider is normalized into, and only then snapped
 * to the nearest rung this particular model actually accepts. Sending a level a
 * model never published is a request OpenRouter rejects outright.
 */
final class Ladder
{
    /** The canonical ladder, cheapest first. */
    public const CANONICAL = OpenRouterPricingNormalizer::EFFORTS;

    /**
     * Where a deliberation score sits on the canonical ladder. The bands are not
     * even fifths: the cheap end is wide because most turns genuinely do not benefit
     * from thinking, and the top two are narrow because each is a real multiple of
     * the last on the bill - `max` costs ten times `none` for the same answer.
     */
    private const BANDS = [
        ['none', 0.12], ['minimal', 0.25], ['low', 0.42],
        ['medium', 0.60], ['high', 0.76], ['xhigh', 0.89], ['max', 1.01],
    ];

    /**
     * @param  list<string>  $available  this model's own rungs, ascending
     */
    public static function choose(array $available, float $deliberation): ?string
    {
        if ($available === []) return null;

        return self::snap($available, self::canonical($deliberation));
    }

    private static function canonical(float $deliberation): string
    {
        $deliberation = max(0.0, min(1.0, $deliberation));
        foreach (self::BANDS as [$effort, $ceiling]) {
            if ($deliberation < $ceiling) return $effort;
        }

        return 'max';
    }

    /**
     * The nearest rung this model offers, and on a tie the cheaper one. A tie means
     * the evidence did not distinguish the two, and when nothing distinguishes them
     * the person should not be charged for the dearer.
     */
    private static function snap(array $available, string $wanted): ?string
    {
        $target = self::rank($wanted);
        $best = null;
        $distance = PHP_INT_MAX;
        foreach ($available as $effort) {
            $rank = self::rank($effort);
            if ($rank < 0) continue;
            $gap = abs($rank - $target);
            // Strictly less, walking an ascending list, keeps the cheaper of a tie.
            if ($gap < $distance) { $distance = $gap; $best = $effort; }
        }

        return $best;
    }

    /** One rung cheaper, or null at the bottom. This is how a turn is made affordable. */
    public static function cheaper(array $available, ?string $current): ?string
    {
        if ($current === null) return null;
        $ordered = self::ordered($available);
        $at = array_search($current, $ordered, true);

        return is_int($at) && $at > 0 ? $ordered[$at - 1] : null;
    }

    /** The model's rungs in canonical order, ignoring anything outside the vocabulary. */
    public static function ordered(array $available): array
    {
        return array_values(array_intersect(self::CANONICAL, $available));
    }

    private static function rank(string $effort): int
    {
        $at = array_search($effort, self::CANONICAL, true);

        return is_int($at) ? $at : -1;
    }
}
