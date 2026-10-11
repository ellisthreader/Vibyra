<?php

namespace App\Services\Teams;

use App\Models\{Organization, User};
use App\Services\Platform\AccountActivity;

/**
 * Every membership, role, invitation, cap and SSO change lands in the account activity log (Part 11) for the person who did it
 * and for the person it happened to. The affected row is written as `system` so it never carries the actor's IP address.
 */
final class Audit
{
    /** @param int|User|null $affected someone other than the actor, or null when the actor is the only party */
    public static function record(int|User $actor, string $event, Organization $org, int|User|null $affected = null, array $detail = []): void
    {
        $actorId = $actor instanceof User ? $actor->id : $actor;
        $detail = ['org' => $org->name] + $detail;
        AccountActivity::record($actorId, $event, $detail);
        $affectedId = $affected instanceof User ? $affected->id : $affected;
        if ($affectedId !== null && $affectedId !== $actorId) {
            AccountActivity::record($affectedId, $event, $detail + ['by' => $actorId], 'system');
        }
    }
}
