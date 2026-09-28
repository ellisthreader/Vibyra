<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireOwner
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user('web');
        $owners = config('owner_analytics.emails', []);
        if ($user && $user->email === LocalOwnerAccess::EMAIL && LocalOwnerAccess::available($request)
            && $user->hasVerifiedEmail() && $user->getAttribute('guest_at') === null) {
            return $next($request);
        }
        if (! $user || ! $user->hasVerifiedEmail() || $user->getAttribute('guest_at') !== null
            || ! in_array(strtolower((string) $user->email), $owners, true)) {
            abort(403);
        }

        return $next($request);
    }
}
