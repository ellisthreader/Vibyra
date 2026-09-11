<?php

namespace App\Services\Vibes\Auto;

use App\Services\Vibes\TurnPrice;

/**
 * Everything about this turn that is not the prompt: what it will cost to send,
 * what the account can actually pay, and what the chat requires of a model. The
 * router needs all of it, because a choice the person cannot fund is not a choice.
 */
final class Situation
{
    public function __construct(
        /** Bytes of prompt and history the provider will be billed for. */
        public readonly int $inputBound,
        /** The most Vibes this turn may cost, already capped at the per-turn ceiling. */
        public readonly int $budget,
        /** The account holds no purchased Vibes, so only trial-funded models can run. */
        public readonly bool $trialOnly,
        /** The chat is bound to a project, so the model must support tool calling. */
        public readonly bool $needsTools = false,
        public readonly int $historyBytes = 0,
        public readonly int $historyTurns = 0,
    ) {}

    public static function of(int $inputBound, int $spendable, bool $trialOnly, bool $needsTools, int $historyBytes, int $historyTurns): self
    {
        return new self(
            inputBound: max(0, $inputBound),
            // A floor of one Vibe keeps the feasibility search meaningful for an empty
            // wallet: it still returns the cheapest sendable turn, and the spend gate in
            // `Turns::submit` is left to refuse it with the message about topping up.
            budget: max(1, min(TurnPrice::CEILING, $spendable)),
            trialOnly: $trialOnly,
            needsTools: $needsTools,
            historyBytes: max(0, $historyBytes),
            historyTurns: max(0, $historyTurns),
        );
    }
}
