<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Models\AgentV2\RuntimeBinding;
use App\Models\User;
use App\Services\AgentRuns\{Access, ApiError};
use App\Services\AgentRuns\RuntimeBindings;
use Illuminate\Http\Request;

/**
 * People authenticate with the account session + the V2 cohort gate. The Mac runner authenticates with its per-binding
 * runner key alone (F-03): it holds no account session, and a request that carries a runner key is never a person.
 */
trait V2Requests
{
    use UserPayloads;

    private function v2User(Request $request): User
    {
        if ($request->headers->has('X-Vibyra-Runner-Key'))
            ApiError::throw(403, 'runner_credential_refused', 'The Mac runner cannot use this endpoint; only the person can.');
        $user = $this->authenticatedUser($request);
        app(Access::class)->require($user->id);
        return $user;
    }

    private function runner(Request $request, string $runtimeId): RuntimeBinding
    {
        $key = $request->header('X-Vibyra-Runner-Key');
        $bindings = app(RuntimeBindings::class);
        if (!config('agents_v2.runner_key_only')) { // legacy rollback: the account session must match the binding too
            $user = $this->authenticatedUser($request);
            app(Access::class)->require($user->id);
            return $bindings->authenticate($user->id, $runtimeId, $key);
        }
        // The key is the whole credential; an Authorization header, if an older runner still sends one, is ignored.
        $binding = $bindings->authenticate(null, $runtimeId, $key);
        app(Access::class)->require($binding->user_id);
        return $binding;
    }

    /** 304 when the caller already has this exact representation. */
    private function conditional(Request $request, string $etag, callable $body)
    {
        if (in_array($etag, array_map('trim', explode(',', (string) $request->header('If-None-Match'))), true))
            return response('', 304)->header('ETag', $etag)->header('Cache-Control', 'private, no-cache');
        return $this->json($body())->header('ETag', $etag)->header('Cache-Control', 'private, no-cache');
    }
}
