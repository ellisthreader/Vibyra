<?php

namespace App\Services\ChatConnectors;

/**
 * A connected account's label: its display name plus a short stable provider id, so two accounts that share a name (two
 * Slack workspaces called "Acme", two Linear people called "Sam Lee") are different accounts to "is this the same
 * account" checks and look different on approval cards. A provider that reports no id keeps its plain name.
 */
final class AccountLabel
{
    public static function of(string $name, ?string ...$ids): string
    {
        $ids = array_values(array_filter(array_map(fn (?string $id) => $id === null ? '' : substr(trim($id), 0, 12), $ids), fn (string $id) => $id !== ''));
        return mb_substr(trim($name), 0, 100).($ids ? ' · '.implode('/', $ids) : '');
    }
}
