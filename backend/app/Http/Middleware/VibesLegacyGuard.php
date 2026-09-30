<?php

namespace App\Http\Middleware;

use App\Services\Auth\SessionAuthenticator;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VibesLegacyGuard
{
    public function handle(Request $request, Closure $next)
    {
        // An enrolled free account cannot obtain a second free allowance through older clients.
        // Existing paid legacy accounts keep the service they already purchased.
        if (config('vibes.enabled') && $request->is('api/chat', 'api/chat/*', 'api/codex/responses', 'api/terminal/*')) {
            $session = app(SessionAuthenticator::class)->authenticate((string) $request->bearerToken());
            $user = $session['session']->user ?? null;
            if ($user && ($user->plan ?: 'free') === 'free'
                && DB::table('vibes_wallets')->where('user_id', $user->id)->exists()) {
                return response()->json(['error' => 'Continue this account in the current Vibyra AI chat.', 'code' => 'vibes_client_required'], 409);
            }
        }
        return $next($request);
    }
}
