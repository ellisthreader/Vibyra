<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\AgentRuns\ApiError;
use App\Services\Platform\ApiKeys;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The door of `/api/platform/*`. A personal API key is a bearer `vyk_…` secret; it is never a session, so it cannot reach any
 * route that answers to a person (approvals, billing, key management). `AuthenticateApiKey:runs:read,runs:create` also
 * demands those scopes. Each accepted request spends one of the key's per-minute requests.
 */
final class AuthenticateApiKey
{
    public function __construct(private readonly ApiKeys $keys) {}

    public function handle(Request $request, Closure $next, string ...$scopes): Response
    {
        if (!ApiKeys::enabled()) ApiError::throw(404, 'not_available', 'The developer API is not switched on.');
        $key = $this->keys->authenticate((string) $request->bearerToken());
        $user = $key ? User::query()->find($key->user_id) : null;
        if (!$key || !$user) ApiError::throw(401, 'invalid_api_key', 'This API key is missing, wrong or revoked.');
        if (array_diff($scopes, $key->scopes ?? []) !== [])
            ApiError::throw(403, 'insufficient_scope', 'This key does not have the '.implode(', ', $scopes).' scope.');
        if ($wait = $this->keys->throttle($key)) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json(['ok' => false, 'code' => 'rate_limited',
                'error' => 'This key has used its requests for the minute.'], 429)->header('Retry-After', (string) $wait));
        }
        $this->keys->touch($key);
        $request->attributes->set('apiKey', $key);
        $request->setUserResolver(fn () => $user);
        return $next($request);
    }
}
