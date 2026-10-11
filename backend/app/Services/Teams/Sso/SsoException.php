<?php

namespace App\Services\Teams\Sso;

use RuntimeException;

/**
 * A failed SSO sign-in. `code` is one of a fixed set the portal words itself; nothing the identity provider sent is ever echoed
 * back, so a hostile provider cannot put text, markup or a URL on our page.
 */
final class SsoException extends RuntimeException
{
    public const CODES = ['sso_unavailable', 'sso_state', 'sso_provider', 'sso_token', 'sso_claims', 'sso_domain', 'account_required',
        'two_factor', 'other_team', 'no_seats', 'sso_identity', 'membership_removed', 'cancelled'];

    public function __construct(public readonly string $reason, string $message = '')
    {
        parent::__construct($message !== '' ? $message : $reason);
    }
}
