<?php

namespace App\Services\Vibes\Auto;

/**
 * What Auto chose, and enough of why to say it out loud. The quote already returns
 * `model` and `effort` to the phone, so a decision reaching the composer needs no
 * new field on the wire - only for someone to render what is already being sent.
 */
final class Decision
{
    public function __construct(
        public readonly string $model,
        public readonly ?string $effort,
        public readonly int $credits,
        public readonly string $reason,
        public readonly Demand $demand,
        /** True when the first choice was stepped back to fit the budget. */
        public readonly bool $constrained = false,
    ) {}

    /**
     * One plain sentence, in the voice the catalogue's own blurbs use. The dominant
     * axis is named rather than the score, because "this needs a big window" is
     * something a person can disagree with and "breadth 0.71" is not.
     */
    public static function explain(Demand $demand, bool $constrained): string
    {
        if ($constrained) return 'The strongest model this turn could afford.';
        $axes = ['capability' => $demand->capability, 'deliberation' => $demand->deliberation, 'breadth' => $demand->breadth];
        arsort($axes);
        $leading = (string) array_key_first($axes);
        if ($axes[$leading] < 0.30) return 'A quick, inexpensive model for a straightforward turn.';

        return match ($leading) {
            'deliberation' => 'Chosen to think this one through before answering.',
            'breadth' => 'Chosen for the amount of context this turn has to hold.',
            default => 'Chosen for how much this turn asks of the model.',
        };
    }
}
