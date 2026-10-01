<?php
namespace App\Services\CloudWorkspaces\Git;

/** A refusal with a stable machine code, rendered as JSON by the Git controllers. */
final class GitRefused extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status = 403)
    {
        parent::__construct($message);
    }
}
