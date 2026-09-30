<?php

namespace App\Services\ChatConnectors;

/**
 * One plain address. PHP's own email filter also accepts quoted local parts (`"a@evil.com,b"@c.com`) and comments,
 * which a downstream parser may read as two recipients, so a recipient here is an ASCII addr-spec with none of that.
 */
final class Recipient
{
    public static function valid(mixed $address): bool
    {
        return is_string($address) && strlen($address) <= 254 && filter_var($address, FILTER_VALIDATE_EMAIL) !== false
            && preg_match('/\A[A-Za-z0-9.!#$%&\'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\z/D', $address) === 1;
    }
}
