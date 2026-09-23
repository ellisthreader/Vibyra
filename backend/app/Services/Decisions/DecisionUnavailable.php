<?php
namespace App\Services\Decisions;
/** A failed judgment can still be billable; never retain provider text or credentials. */
final class DecisionUnavailable extends \RuntimeException
{
    public function __construct(public readonly ?int $usageMicroUsd)
    {
        parent::__construct('decision_unavailable');
    }
}
