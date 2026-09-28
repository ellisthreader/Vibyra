<?php

namespace App\Services\Membership;

use App\Models\User;
use Illuminate\Support\Carbon;

final class NewAccounts
{
    public static function eligible(User $user): bool
    {
        $from = config('membership.new_accounts_from');
        return config('membership.enabled') && $from && !$user->isGuest()
            && ($user->plan ?: 'free') === 'free' && !$user->membership_ends_at
            && $user->created_at && $user->created_at->gte(Carbon::parse($from));
    }
}
