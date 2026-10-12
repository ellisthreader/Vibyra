<?php

namespace App\Services\Account;

use App\Services\Vibes\Turns;

final class TurnAccess
{
    /** Known pre-dispatch refusal still settles already-confirmed usage and releases the rest. */
    public static function stopIfBanned(object $turn, ?int $confirmedMicro = null): bool
    {
        if (AccountAccess::allowed($turn->user_id)) return false;
        app(Turns::class)->settle($turn->id, $confirmedMicro ?? $turn->actual_micro_usd, null,
            'Account access was revoked. No further action was started. Only confirmed usage was charged.');
        return true;
    }
}
