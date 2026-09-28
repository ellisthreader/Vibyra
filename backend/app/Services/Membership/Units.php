<?php

namespace App\Services\Membership;

use Illuminate\Support\Facades\DB;

final class Units
{
    public const SCALE = 10000;
    public static function scale(int $userId): int
    {
        return DB::table('vibes_wallets')->where('user_id', $userId)->value('billing_version') == 2 ? self::SCALE : 1;
    }
    public static function modern(int $userId): bool { return self::scale($userId) === self::SCALE; }
    public static function microPerUnit(object $turn): int { return intdiv(self::SCALE, $turn->unit_scale ?? 1); }
    public static function tokens(int $units, int $scale): float { return $units / $scale; }
}
