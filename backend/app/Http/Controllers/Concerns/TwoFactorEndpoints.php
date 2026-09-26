<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Auth\TwoFactor;
use App\Services\Auth\TwoFactorChallenge;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Turning a second factor on, off, and proving one at login.
 *
 * Only a password account is offered this. An Apple or Google account never reaches
 * this server with a password at all -- the provider signs it in, and the provider is
 * where its own second factor belongs -- so a code asked for here would be a step
 * that guards nothing. `startTwoFactor` says so rather than quietly refusing.
 */
trait TwoFactorEndpoints
{
    public function twoFactorStatus(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return $this->json(['ok' => true, ...$this->twoFactorPayload($user)]);
    }

    /** A new secret and the link that carries it. Nothing is gated until it is confirmed. */
    public function startTwoFactor(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        if (($user->provider ?: 'email') !== 'email') {
            return $this->json(['ok' => false, 'error' => 'This account signs in with ' . ucfirst((string) $user->provider)
                . '. Add a second step there and it protects your Vibyra account too.'], 422);
        }
        if (app(TwoFactor::class)->enabled($user)) {
            return $this->json(['ok' => false, 'error' => 'Two-factor authentication is already on for this account.'], 409);
        }
        $secret = app(TwoFactor::class)->start($user);

        return $this->json([
            'ok' => true,
            'secret' => $secret,
            'uri' => app(TwoFactor::class)->setupUri($user, $secret),
            'account' => $user->email,
        ]);
    }

    /** The first code from the app, which is what proves the setup actually worked. */
    public function confirmTwoFactor(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $codes = app(TwoFactor::class)->confirm($user, (string) $request->input('code', ''));
        if ($codes === null) {
            return $this->json(['ok' => false, 'error' => 'That code didn’t match. Check your authenticator app and try the current code.'], 422);
        }

        return $this->json(['ok' => true, 'recoveryCodes' => $codes, 'user' => $this->userPayload($user->fresh() ?? $user)]);
    }

    /** A new set of recovery codes, proved by the app or by one of the old codes. */
    public function replaceTwoFactorRecoveryCodes(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        if (! $this->provedSecondFactor($user, $request)) {
            return $this->json(['ok' => false, 'error' => 'Enter the current code from your authenticator app.'], 422);
        }

        return $this->json(['ok' => true, 'recoveryCodes' => app(TwoFactor::class)->replaceRecoveryCodes($user)]);
    }

    /**
     * Turning it off, which takes the same proof as turning it on did. A password
     * alone is not enough: a password is exactly what the second step exists to
     * survive, so the person switching it off has to hold the second factor too.
     */
    public function disableTwoFactor(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        if (! app(TwoFactor::class)->enabled($user)) {
            app(TwoFactor::class)->disable($user);

            return $this->json(['ok' => true, 'user' => $this->userPayload($user->fresh() ?? $user)]);
        }
        if (! $this->provedSecondFactor($user, $request)) {
            return $this->json(['ok' => false, 'error' => 'Enter a code from your authenticator app, or one of your recovery codes.'], 422);
        }
        app(TwoFactor::class)->disable($user);

        return $this->json(['ok' => true, 'user' => $this->userPayload($user->fresh() ?? $user)]);
    }

    /** The second half of a login: the challenge from `/api/auth/login`, and a code. */
    public function loginTwoFactor(Request $request): JsonResponse
    {
        $user = app(TwoFactorChallenge::class)->claim(
            trim((string) $request->input('challengeId', '')),
            (string) $request->input('code', ''),
        );
        if (! $user) {
            return $this->json(['ok' => false, 'error' => 'That code didn’t match. Try the current code from your authenticator app.'], 401);
        }

        return $this->json($this->sessionPayload($request, $user));
    }

    /** What Settings shows about the second factor, without ever resending the secret. */
    private function twoFactorPayload(User $user): array
    {
        $on = app(TwoFactor::class)->enabled($user);

        return [
            'enabled' => $on,
            'available' => ($user->provider ?: 'email') === 'email',
            'confirmedAt' => $on ? optional($user->two_factor_confirmed_at)->toIso8601String() : null,
            'recoveryCodesLeft' => $on ? count(app(TwoFactor::class)->recoveryCodes($user)) : 0,
        ];
    }

    /** A code from the app or a recovery code; a password is never a substitute. */
    private function provedSecondFactor(User $user, Request $request): bool
    {
        return app(TwoFactor::class)->check($user, (string) $request->input('code', ''));
    }
}
