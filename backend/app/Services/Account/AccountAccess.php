<?php

namespace App\Services\Account;

use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

/** Always read current state; a stale authenticated model is not current authority. */
final class AccountAccess
{
    public static function withActive(int $userId, callable $operation): mixed
    {
        return DB::transaction(function () use ($userId, $operation) {
            User::whereKey($userId)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            self::require($userId);
            return $operation();
        }, 3);
    }

    public static function allowed(int $userId): bool
    {
        return User::whereKey($userId)->whereNull('owner_banned_at')->exists();
    }

    public static function require(int $userId): void
    {
        if (!self::allowed($userId)) throw new HttpResponseException(response()->json([
            'ok' => false, 'code' => 'account_banned',
            'error' => 'This account has been banned. Contact support if you believe this is a mistake.',
        ], 403)->header('Cache-Control', 'private, no-store'));
    }
}
