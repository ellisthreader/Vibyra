<?php
namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Auth\SessionAuthenticator;
use Illuminate\Http\Request;

/**
 * Turning a bearer token into the `vibyra_sessions` row behind it, refreshing
 * that row's request metadata on the way. `UserPayloads::authenticatedUser`
 * layers the guest rule on top of what is resolved here.
 */
trait SessionResolution
{
    private function authenticatedSession(Request $request): VibyraSession
    {
        $token = (string) $request->bearerToken();
        if ($token === '') {
            abort($this->json(['ok' => false, 'error' => 'Missing app session token.'], 401));
        }

        $result = $this->resolveSession($request, $token);
        if (! $result) {
            abort($this->json(['ok' => false, 'error' => 'Your session expired. Please log in again.'], 401));
        }

        $request->attributes->set('vibyra.session.used_previous_token', $result['using_previous_token']);

        return $result['session'];
    }

    private function optionalAuthenticatedUser(Request $request, bool $allowGuest = false): ?User
    {
        $token = (string) $request->bearerToken();
        if ($token === '') {
            return null;
        }

        $result = $this->resolveSession($request, $token);
        if (! $result) {
            return null;
        }

        $request->attributes->set('vibyra.session.used_previous_token', $result['using_previous_token']);

        // A guest reads as signed out to anything that has not asked for one,
        // rather than as an error: these callers already have a signed-out path,
        // and it is the correct one for an account that does not exist yet.
        $user = $result['session']->user;

        return $user->isGuest() && ! $allowGuest ? null : $user;
    }

    private function resolveSession(Request $request, string $token): ?array
    {
        return app(SessionAuthenticator::class)->authenticate($token, [
            'ip_address' => $this->sessionRequestIp($request),
            'user_agent' => (string) $request->userAgent(),
        ]);
    }
}
