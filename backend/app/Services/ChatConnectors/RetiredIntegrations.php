<?php

namespace App\Services\ChatConnectors;

/** Retired provider credentials can never be refreshed or used by stale queued work. */
final class RetiredIntegrations
{
    public const IDS = ['outlook_mail', 'outlook_calendar', 'onedrive', 'teams', 'sharepoint'];

    public static function contains(string $provider): bool
    {
        return in_array($provider, self::IDS, true);
    }
}
