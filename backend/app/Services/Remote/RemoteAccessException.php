<?php

namespace App\Services\Remote;

/** A refusal with the HTTP status the phone or computer should see it as. */
class RemoteAccessException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
