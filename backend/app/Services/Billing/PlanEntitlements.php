<?php

namespace App\Services\Billing;

class PlanEntitlements
{
    public function maxConcurrentTerminalAgents(string $plan): int
    {
        return max(1, (int) config(
            'billing.plans.'.$this->normalizedPlan($plan).'.max_concurrent_agents',
            0
        ));
    }

    public function contextTokenCap(string $plan): int
    {
        return max(1, (int) config(
            'billing.plans.'.$this->normalizedPlan($plan).'.context_token_cap',
            16000
        ));
    }

    public function boundedOutputTokens(
        string $plan,
        int $inputTokens,
        int $requestedOutputTokens,
        int $minimumOutputTokens = 1,
    ): ?int {
        $remaining = $this->contextTokenCap($plan) - max(0, $inputTokens);
        $minimum = max(1, $minimumOutputTokens);
        if ($remaining < $minimum) {
            return null;
        }

        return min(max($minimum, $requestedOutputTokens), $remaining);
    }

    private function normalizedPlan(string $plan): string
    {
        $key = strtolower(trim($plan));

        return config("billing.plans.{$key}") !== null ? $key : 'free';
    }
}
