<?php

namespace App\Http\Middleware;

use App\Services\AgentRuns\ApiError;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The route-level door of Agent V2 (F-30). Authentication was per controller method, so a future method could forget
 * it. Every non-public route now passes this first: `user` needs a session token and never a runner key; `runner` needs
 * the runner key. The controllers still verify the credential itself (session, binding, cohort); this only makes a route
 * without any credential unreachable. Public routes (webhooks, OAuth callbacks, client metadata) simply do not use it.
 */
final class AgentV2Credentials
{
    public function handle(Request $request, Closure $next, string $as = 'user'): Response
    {
        $key = $request->header('X-Vibyra-Runner-Key');
        if ($as === 'runner') {
            if (!is_string($key) || strlen($key) !== 64) ApiError::throw(403, 'invalid_runner_key', 'Invalid runner key.');
        } else {
            if ($key !== null) ApiError::throw(403, 'runner_credential_refused', 'The Mac runner cannot use this endpoint; only the person can.');
            if ((string) $request->bearerToken() === '') ApiError::throw(401, 'session_required', 'Missing app session token.');
        }
        return $next($request);
    }
}
