<?php

namespace App\Services\Vibes\Auto;

/**
 * What a turn asks for, on three axes that are genuinely independent, plus the kind
 * of work it is. Keeping them apart is the whole idea:
 *
 *   capability   - how strong a model has to be to get this right at all
 *   deliberation - how much step-by-step thinking improves the answer
 *   breadth      - how much text the turn has to hold at once
 *
 * They come apart constantly. A logic puzzle is twelve words and needs the deepest
 * thinking available. Reformatting a 900-line file needs an enormous window and no
 * thinking whatever. "Design a consensus protocol" needs both. A router with one
 * "how hard is this" number cannot tell those three apart, and every mistake such a
 * router makes is a case where it conflated them - which is why this one does not.
 */
final class Demand
{
    private function __construct(
        public readonly float $capability,
        public readonly float $deliberation,
        public readonly float $breadth,
        /** @var array<string, float> */
        public readonly array $specialty,
    ) {}

    public static function from(Signals $s): self
    {
        // How much there is to do, as opposed to how hard any of it is. The weights
        // sum to one, so this is a proportion of a maximally demanding prompt.
        $scope = 0.30 * self::saturate($s->words, 150)
            + 0.22 * self::saturate($s->constraints, 4)
            + 0.20 * self::saturate($s->steps, 5)
            + 0.16 * self::saturate($s->paths, 4)
            + 0.12 * self::saturate($s->codeBytes, 3000);

        // Skilled production work, as opposed to a question about it. Prose is left
        // out deliberately: a weak model writing an email degrades gracefully, and a
        // weak model writing concurrency code does not.
        $craft = max($s->specialty['code'] ?? 0.0, $s->specialty['frontend'] ?? 0.0,
            $s->specialty['debug'] ?? 0.0, $s->specialty['math'] ?? 0.0,
            $s->specialty['analysis'] ?? 0.0, $s->specialty['ops'] ?? 0.0);

        $breadth = self::any([
            $s->breadth,
            0.80 * self::saturate($s->contextBytes, 12000),
            0.60 * self::saturate($s->paths, 5),
            0.70 * self::saturate($s->codeBytes, 6000),
            0.40 * self::saturate($s->historyTurns, 8),
        ]);

        // Deliberation is settled first, because it is the axis that owes nothing to
        // the others: a report of something failing is a request to work out why,
        // whatever else the prompt is. Difficulty feeds it at half weight - a hard
        // task rewards thinking even unasked - but only half, or the two axes
        // collapse into one and the router loses the distinction it exists to make.
        $deliberation = self::any([
            $s->deliberation,
            0.50 * $s->difficulty,
            0.50 * ($s->specialty['math'] ?? 0.0),
            0.45 * ($s->specialty['debug'] ?? 0.0),
            0.45 * ($s->stackTrace ? 1.0 : 0.0),
            0.35 * $scope,
            0.30 * $craft,
        ]) * (1.0 - 0.55 * $s->mechanical) * (1.0 - 0.45 * $s->brevity);

        // Capability has a floor set by the kind of work, not only by its difficulty.
        // "Implement a debounce function" carries no hard words at all and still must
        // not be handed to the weakest model in the catalogue; without this the axis
        // read almost every ordinary coding request as though it were a lookup.
        // Thinking hard only helps a model that can think, so deliberation raises it
        // too - at well under half weight, so the two stay distinguishable.
        $capability = self::any([
            $s->difficulty,
            0.46 * $craft,
            0.75 * $scope,
            0.55 * $breadth,
            0.28 * $deliberation,
        ]) * (1.0 - 0.30 * $s->mechanical);

        return new self(
            capability: self::bound($capability),
            deliberation: self::bound($deliberation),
            breadth: self::bound($breadth),
            specialty: $s->specialty,
        );
    }

    /**
     * How much this turn justifies spending. Cost matters most when nothing is being
     * asked for; when any axis is loud, the cheap answer is the expensive one.
     */
    public function pressure(): float
    {
        return max($this->capability, $this->deliberation, $this->breadth);
    }

    public function affinity(string $specialty): float
    {
        return $this->specialty[$specialty] ?? 0.0;
    }

    /**
     * Independent evidence again, in the same shape `Signals` uses: each term is one
     * more reason, the result approaches 1 without reaching it, and a single decisive
     * term still outranks several weak ones.
     */
    private static function any(array $terms): float
    {
        $miss = 1.0;
        foreach ($terms as $term) $miss *= 1.0 - self::bound($term);

        return 1.0 - $miss;
    }

    /**
     * A count as a proportion. `$half` is the count that reads as halfway, so this
     * has no ceiling to tune and no cliff: one more constraint always means a little
     * more, and the tenth matters less than the second.
     */
    private static function saturate(int|float $count, float $half): float
    {
        return $count <= 0 ? 0.0 : $count / ($count + $half);
    }

    private static function bound(float $value): float
    {
        return max(0.0, min(1.0, $value));
    }
}
