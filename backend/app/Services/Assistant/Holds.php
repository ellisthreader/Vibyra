<?php
namespace App\Services\Assistant;

use Illuminate\Support\Facades\{DB, Schema};

final class Holds
{
    public static function active(int $user): int
    {
        if (!Schema::hasTable('assistant_requests')) return 0;
        return DB::table('assistant_requests')->where('user_id', $user)->where('state', 'reserved')
            ->where('created_at', '>', now()->subMinutes(3))->count();
    }
    public static function units(int $user): int
    {
        if (!Schema::hasTable('assistant_requests')) return 0;
        return (int) DB::table('assistant_requests')->where('user_id', $user)->where('state', 'reserved')->sum('reserved_units');
    }
    public static function usesGrant(int $user, int $grant): bool
    {
        if (!Schema::hasTable('assistant_requests')) return false;
        foreach (DB::table('assistant_requests')->where('user_id', $user)->where('state', 'reserved')->get(['allocations']) as $r) {
            if (collect(json_decode($r->allocations, true))->contains('id', $grant)) return true;
        }
        return false;
    }
}
