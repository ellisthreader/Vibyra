<?php
namespace App\Http\Middleware;

use App\Services\Assistant\Failure;
use App\Services\Auth\SessionAuthenticator;
use Closure;
use Illuminate\Http\Request;

final class AssistantSession
{
    public function handle(Request $request, Closure $next)
    {
        $result = app(SessionAuthenticator::class)->authenticate((string) $request->bearerToken());
        $user = $result['session']->user ?? null;
        if (!$user) Failure::raise(401, 'session_required', 'Sign in to Vibyra to use the assistant.');
        if ($user->isGuest()) Failure::raise(403, 'account_required', 'Create a Vibyra account to use the assistant.');
        if (!$user->hasVerifiedEmail()) Failure::raise(403, 'verification_required', 'Verify your email to use the assistant.');
        if ($request->hasHeader('X-Vibyra-Runner-Key')) Failure::raise(403, 'account_required', 'Use your Vibyra account session.');
        $request->attributes->set('assistant.user', $user);
        $request->setUserResolver(fn () => $user);
        $response = $next($request);
        $response->headers->set('Cache-Control', 'private, no-store');
        return $response;
    }
}
