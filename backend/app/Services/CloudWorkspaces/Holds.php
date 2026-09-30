<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{DB, Schema};

/** Additive compatibility reader: old AI holds retain their original identity. */
final class Holds
{
    public static function available(): bool
    {
        return Schema::hasTable('cloud_reservations');
    }
    public static function units(int $user): int
    {
        return self::available() ? (int) DB::table('cloud_reservations')->where('user_id', $user)->whereNull('settled_at')->sum('reserved') : 0;
    }
    public static function usesGrant(int $user, int $grant): bool
    {
        if (!self::available()) return false;
        foreach (DB::table('cloud_reservations')->where('user_id', $user)->whereNull('settled_at')->get(['allocations']) as $r) {
            if (collect(json_decode($r->allocations, true))->contains('id', $grant)) return true;
        }
        return false;
    }
}
