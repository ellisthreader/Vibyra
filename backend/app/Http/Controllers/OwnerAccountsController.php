<?php

namespace App\Http\Controllers;

use App\Services\Auth\TwoFactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OwnerAccountsController extends Controller
{
    public function index(Request $request, TwoFactor $twoFactor): JsonResponse
    {
        $user = $request->user('web');
        $verifiedAt = $request->session()->get('owner_second_factor_verified_at');
        $verifiedFor = $request->session()->get('owner_second_factor_user_id');
        if (! $twoFactor->enabled($user) || ! is_numeric($verifiedAt)
            || (int) $verifiedFor !== (int) $user->id
            || (int) $verifiedAt < now()->subMinutes(10)->timestamp) {
            return response()->json([
                'ok' => false,
                'error' => 'owner_two_factor_required',
                'enabled' => $twoFactor->enabled($user),
                'provider' => $user->provider ?: 'email',
            ], 428)->header('Cache-Control', 'private, no-store');
        }

        $page = $request->query('page', '1');
        if (! is_string($page) || ! ctype_digit($page) || (int) $page < 1 || (int) $page > 100000) {
            return response()->json(['ok' => false, 'error' => 'Invalid page.'], 422);
        }

        $recent = now()->subMinutes(5);
        $sessionSummary = DB::table('vibyra_sessions')->select('user_id')
            ->selectRaw('MAX(last_used_at) as last_session_used_at')
            ->selectRaw('SUM(CASE WHEN revoked_at IS NULL AND last_used_at >= ? THEN 1 ELSE 0 END) as recent_sessions_5m', [$recent])
            ->groupBy('user_id');
        $loginSummary = DB::table('auth_login_events')->select('user_id')
            ->selectRaw('MAX(created_at) as last_login_at')
            ->selectRaw('SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as logins_30d', [now()->subDays(30)])
            ->groupBy('user_id');
        $accounts = DB::table('users')->leftJoinSub($sessionSummary, 'usage',
            fn ($join) => $join->on('usage.user_id', '=', 'users.id'))
            ->leftJoinSub($loginSummary, 'logins', fn ($join) => $join->on('logins.user_id', '=', 'users.id'))
            ->select('users.id', 'users.name', 'users.email', 'users.plan',
                'users.created_at', 'users.email_verified_at',
                'usage.last_session_used_at', 'usage.recent_sessions_5m',
                'logins.last_login_at', 'logins.logins_30d')
            ->orderByDesc('users.created_at')->orderByDesc('users.id')
            ->paginate(25, ['*'], 'page', (int) $page);

        return response()->json([
            'ok' => true,
            'accounts' => $accounts->items(),
            'page' => $accounts->currentPage(),
            'per_page' => $accounts->perPage(),
            'total' => $accounts->total(),
            'last_page' => $accounts->lastPage(),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function verify(Request $request, TwoFactor $twoFactor): JsonResponse
    {
        $user = $request->user('web');
        if (! $twoFactor->enabled($user)) {
            return response()->json(['ok' => false, 'error' => 'Set up two-factor authentication first.'], 403);
        }
        $code = $request->validate(['code' => 'required|string|max:32'])['code'];
        if (! $twoFactor->check($user, $code)) {
            return response()->json(['ok' => false, 'error' => 'Invalid or already-used code.'], 422);
        }

        $request->session()->put('owner_second_factor_verified_at', now()->timestamp);
        $request->session()->put('owner_second_factor_user_id', $user->id);

        return response()->json(['ok' => true, 'expires_at' => now()->addMinutes(10)->toIso8601String()])
            ->header('Cache-Control', 'private, no-store');
    }
}
