<?php

namespace App\Services\Billing;

class TerminalOutputBudget
{
    public function affordableOutputTokens(
        CreditCalculator $calculator,
        string $modelKey,
        int $inputTokens,
        int $requestedOutputTokens,
        int $minimumOutputTokens,
        int $availableCredits,
        float $requestCostMultiplier = 1.0,
    ): int {
        $requested = max(1, $requestedOutputTokens);
        $minimum = min($requested, max(1, $minimumOutputTokens));
        if ($availableCredits <= 0 || $this->credits(
            $calculator, $modelKey, $inputTokens, $requested, $requestCostMultiplier
        ) <= $availableCredits) {
            return $requested;
        }
        if ($this->credits(
            $calculator, $modelKey, $inputTokens, $minimum, $requestCostMultiplier
        ) > $availableCredits) {
            return $requested;
        }

        $low = $minimum;
        $high = $requested;
        while ($low < $high) {
            $candidate = (int) ceil(($low + $high) / 2);
            if ($this->credits(
                $calculator, $modelKey, $inputTokens, $candidate, $requestCostMultiplier
            ) <= $availableCredits) {
                $low = $candidate;
            } else {
                $high = $candidate - 1;
            }
        }

        return $low;
    }

    private function credits(
        CreditCalculator $calculator,
        string $modelKey,
        int $inputTokens,
        int $outputTokens,
        float $requestCostMultiplier,
    ): int {
        return (int) ceil(
            $calculator->estimateTerminalReservationCredits(
                $modelKey,
                $inputTokens,
                $outputTokens,
                true
            )
            * max(1.0, $requestCostMultiplier)
        );
    }
}
