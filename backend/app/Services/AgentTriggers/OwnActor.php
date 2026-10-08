<?php

namespace App\Services\AgentTriggers;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Trigger;

/**
 * Loop guard: the accounts a person connected are the ones their teammates write as, so an event authored by
 * that identity may be the echo of the teammate's own comment, issue or reply. GitHub keeps the login
 * (`@login`); Linear and Slack keep `Name · <short id>[/<id>]` (ChatConnectors\AccountLabel), so the id is read
 * from that label. A trigger may opt back in with `includeOwn` (the person's own activity is the point).
 */
final class OwnActor
{
    /** @param string[] $actors lowercase provider ids of whoever caused the event */
    public static function authored(Trigger $trigger, array $actors): bool
    {
        if (($trigger->filter['includeOwn'] ?? false) === true || $actors === []) return false;
        $own = self::ids($trigger, explode('.', $trigger->kind)[0]);
        foreach ($actors as $actor) {
            foreach ($own as $id) if ($actor !== '' && $id !== '' && ($actor === $id || (strlen($id) >= 8 && str_starts_with($actor, $id)))) return true;
        }
        return false;
    }

    /** @return string[] lowercase ids this trigger's account acts as (Linear: a prefix of the user UUID) */
    public static function ids(Trigger $trigger, string $provider): array
    {
        if (!in_array($provider, ['github', 'linear'], true)) return [];
        $rows = Connection::query()->where('user_id', $trigger->user_id)->where('provider', $provider)->whereNull('revoked_at')
            ->when($trigger->connection_id, fn ($q) => $q->whereKey($trigger->connection_id))->get(['external_identity']);
        $ids = [];
        foreach ($rows as $row) {
            $label = (string) $row->external_identity;
            if ($provider === 'github') $ids[] = strtolower(ltrim($label, '@'));
            elseif (($at = strrpos($label, ' · ')) !== false) $ids[] = strtolower(explode('/', substr($label, $at + 4))[0]);
        }
        return array_values(array_unique(array_filter($ids)));
    }

    /** The Slack team id inside a Slack account label ("Acme · T0123ABCD/U0123ABCD"), or null. */
    public static function slackTeam(?string $label): ?string
    {
        return preg_match('/ · (T[A-Z0-9]{4,11})(?:\/|$)/D', (string) $label, $m) ? $m[1] : null;
    }
}
