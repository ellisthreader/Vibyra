<?php

namespace App\Services\Decisions;

/** Safe diagnostic fields only; a rejected judgment can still be billable. */
final class DecisionUnavailable extends \RuntimeException
{
    public function __construct(
        public readonly ?int $usageMicroUsd,
        public readonly string $reason = 'unavailable',
        public readonly ?int $httpStatus = null,
    ) {
        parent::__construct('decision_unavailable');
    }
}
