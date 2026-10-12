<?php

namespace App\Services\Account;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

final class WebAccountSession
{
    public static function start(Request $request, User $user): void
    {
        AccountAccess::withActive($user->id, function () use ($request, $user) {
            $fresh = $user->fresh();
            Auth::guard('web')->login($fresh);
            $request->session()->regenerate();
            // If a ban commits before this session is persisted, its old epoch is still rejected.
            $request->session()->put('account_session_epoch', (int) $fresh->account_session_epoch);
        });
    }
}
