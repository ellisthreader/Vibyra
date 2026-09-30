<?php

namespace App\Services\AgentRuns\Tools;

use RuntimeException;

/** A definite policy refusal. The reason is safe to show the model and the person. */
final class ToolRefused extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
