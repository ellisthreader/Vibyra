<?php

namespace App\Services\ChatConnectors;

use RuntimeException;

/**
 * A connection the provider no longer honours (revoked, expired, refresh refused).
 * Its message is safe to show the model: it names the fix and never a credential.
 */
final class ReconnectRequired extends RuntimeException
{
    public static function for(string $slug): self
    {
        $name = (string) config('chat_connectors.catalogue.'.$slug.'.name', 'This service');
        return new self($name.' needs to be reconnected: the saved sign-in expired or was revoked. Tell the person to reconnect it in Settings → Integrations.');
    }
}
