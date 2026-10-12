<?php

namespace App\Http\Middleware;

use App\Services\Account\AccountAccess;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

final class RequireActiveWebAccount
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user('web');
        $fresh = $user?->fresh();
        $banned = $user && (!$fresh || $fresh->owner_banned_at);
        $revoked = $fresh && (int) $request->session()->get('account_session_epoch', 0) !== (int) $fresh->account_session_epoch;
        if ($banned || $revoked) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            if ($request->expectsJson()) {
                if ($banned) AccountAccess::require($user->id);
                return response()->json(['ok' => false, 'error' => 'Your session was revoked. Sign in again.'], 401)
                    ->header('Cache-Control', 'private, no-store');
            }
            return redirect('/login?account='.($banned ? 'banned' : 'expired'))->header('Cache-Control', 'private, no-store');
        }
        return $next($request);
    }
}
