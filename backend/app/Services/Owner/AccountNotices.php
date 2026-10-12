<?php

namespace App\Services\Owner;

use App\Models\User;
use Illuminate\Support\Facades\DB;

final class AccountNotices
{
    public static function owner(User $user): bool
    {
        return !$user->isGuest() && $user->hasVerifiedEmail() && !$user->owner_banned_at
            && in_array(strtolower($user->email), config('owner_analytics.emails', []), true);
    }

    public static function warnings(int $userId): array
    {
        // Only public warning messages. Reasons, operators and other actions stay owner-only.
        return DB::table('owner_account_actions')->where('user_id', $userId)->where('action', 'warn')
            ->orderByDesc('sequence')->limit(20)->get(['id', 'message', 'created_at'])->all();
    }
}
