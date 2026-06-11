<?php

namespace App\Services\Auth;

use RuntimeException;

class ProviderAccountException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
