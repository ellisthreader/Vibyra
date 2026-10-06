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
        if ($request->is('api/chat', 'api/chat/*', 'api/codex/responses', 'api/terminal/*', 'api/speech', 'api/community/assets/generate')) {
            $session = app(SessionAuthenticator::class)->authenticate((string) $request->bearerToken());
            $user = $session['session']->user ?? null;
            if ($user && config('vibes.enabled') && ($user->plan ?: 'free') === 'free' && ! $user->hasVerifiedEmail()) {
                return response()->json(['error' => 'Verify your email before using AI chat.', 'code' => 'email_verification_required'], 403);
            }
            if ($user && (\App\Services\Membership\Units::modern($user->id) || (config('vibes.enabled') && ($user->plan ?: 'free') === 'free'
                && DB::table('vibes_wallets')->where('user_id', $user->id)->exists()))) {
                return response()->json(['error' => 'Continue this account in the current Vibyra AI chat.', 'code' => 'vibes_client_required'], 409);
            }
        }
        return $next($request);
    }
}
