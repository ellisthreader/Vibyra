<?php

namespace App\Services\ChatConnectors;

/**
 * A connector whose provider keeps a grant of its own, so deleting Vibyra's copy of the credential is not enough to
 * end the access. `Installs::disconnect` calls this first; it is best effort and a failure never blocks disconnecting.
 */
interface Revocable
{
    /** Ask the provider to end the access `$credential` represents. */
    public function revoke(string $credential): void;
}
