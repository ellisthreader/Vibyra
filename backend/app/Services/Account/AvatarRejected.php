<?php

namespace App\Services\Account;

use RuntimeException;

/** A photo the account cannot use, with the sentence the phone shows verbatim. */
final class AvatarRejected extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }
}
