<?php

namespace App\Services\Remote;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * The monthly remote data allowance. The relay reports bytes per account with its heartbeat; this counts
 * them per calendar month (UTC) and names the accounts over `remote.monthly_data_gb`, which the relay then
 * slows down. Remote time itself is never limited.
 */
class RemoteDataAllowance
{
    /** One relay report can never claim more than this for an account; anything larger is not a real count. */
    private const MAX_REPORT_BYTES = 10 * 1024 ** 3;

    /** @param mixed $bytes `{userId: bytes}` from a relay `usage` event */
    public function record(mixed $bytes): int
    {
        if (! is_array($bytes)) {
            return 0;
        }
        $period = self::period();
        $recorded = 0;
        foreach (array_slice($bytes, 0, 5000, true) as $userId => $count) {
            if (! ctype_digit((string) $userId) || strlen((string) $userId) > 18 || ! is_int($count) || $count <= 0 || $count > self::MAX_REPORT_BYTES) {
                continue;
            }
            $key = ['user_id' => (int) $userId, 'period' => $period];
            DB::table('remote_data_usage')->insertOrIgnore($key + ['bytes' => 0, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('remote_data_usage')->where($key)->increment('bytes', $count, ['updated_at' => now()]);
            $recorded++;
        }

        return $recorded;
    }

    /** @return list<string> accounts past this month's allowance, for the relay to slow down */
    public function slowedUserIds(): array
    {
        return DB::table('remote_data_usage')->where('period', self::period())->where('bytes', '>=', self::allowanceBytes())
            ->orderBy('user_id')->limit(100000)->pluck('user_id')->map(fn ($id) => (string) $id)->all();
    }

    /** @return array{usedBytes:int, allowanceBytes:int, slowed:bool, resetsAt:string} */
    public function forUser(int $userId): array
    {
        $used = (int) DB::table('remote_data_usage')->where(['user_id' => $userId, 'period' => self::period()])->value('bytes');
        $allowance = self::allowanceBytes();

        return ['usedBytes' => $used, 'allowanceBytes' => $allowance, 'slowed' => $used >= $allowance,
            'resetsAt' => CarbonImmutable::now('UTC')->startOfMonth()->addMonth()->toIso8601String()];
    }

    public static function allowanceBytes(): int
    {
        return (int) round(max(0.0, (float) config('remote.monthly_data_gb')) * 1024 ** 3);
    }

    private static function period(): string
    {
        return CarbonImmutable::now('UTC')->format('Y-m');
    }
}
