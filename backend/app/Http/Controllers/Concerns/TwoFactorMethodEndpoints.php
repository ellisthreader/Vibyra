<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Auth\{TwoFactor, TwoFactorChallenge, TwoFactorCodes, TwoFactorEnrollment, TwoFactorIdentity};
use Illuminate\Http\{JsonResponse, Request};
use RuntimeException;

trait TwoFactorMethodEndpoints
{
    public function startTwoFactorMethod(Request $request): JsonResponse
    {
        return $this->changeSecondFactor($request, function (User $user) use ($request) {
            try {
                $setup = app(TwoFactorEnrollment::class)->start($user, (string) $request->bearerToken(),
                    (string) $request->input('method'), (string) $request->input('phoneNumber'), (string) $request->input('currentCode'));
                return $this->json(['ok' => true, ...$setup]);
            } catch (RuntimeException $error) {
                return $this->json(['ok' => false, 'error' => get_class($error) === RuntimeException::class ? $error->getMessage() : 'Could not complete verification. Try again.'], 422);
            }
        }, 1);
    }

    public function resendTwoFactorMethodCode(Request $request): JsonResponse
    {
        return $this->changeSecondFactor($request, function (User $user) use ($request) {
            try {
                $sent = app(TwoFactorEnrollment::class)->resend($user, (string) $request->bearerToken(),
                    (string) $request->input('enrollmentId'));
                return $this->json(['ok' => $sent, 'error' => $sent ? null : 'Setup expired. Start again.'], $sent ? 200 : 422);
            } catch (RuntimeException $error) {
                return $this->json(['ok' => false, 'error' => get_class($error) === RuntimeException::class ? $error->getMessage() : 'Could not complete verification. Try again.'], 422);
            }
        }, 1);
    }

    public function confirmTwoFactorMethod(Request $request): JsonResponse
    {
        return $this->changeSecondFactor($request, function (User $user) use ($request) {
            $codes = app(TwoFactorEnrollment::class)->confirm($user, (string) $request->bearerToken(),
                (string) $request->input('enrollmentId'), trim((string) $request->input('code')));
            if ($codes === null) return $this->json(['ok' => false, 'error' => 'The code is wrong, expired, or this setup was replaced.'], 422);
            app(\App\Services\Remote\RemoteAccountSecurity::class)->revoke((int) $user->id, reason: 'two_factor_method_changed');
            return $this->json(['ok' => true, 'recoveryCodes' => $codes, 'user' => $this->userPayload($user)]);
        });
    }

    public function sendTwoFactorSettingsCode(Request $request): JsonResponse
    {
        return $this->changeSecondFactor($request, function (User $user) {
            if (! app(TwoFactor::class)->enabled($user) || ! in_array($user->two_factor_method, ['sms', 'email'], true)) {
                return $this->json(['ok' => false, 'error' => 'Use your authenticator or a recovery code.'], 422);
            }
            $identity = app(TwoFactorIdentity::class);
            try {
                app(TwoFactorCodes::class)->send('settings:'.$user->id, $identity->state($user),
                    $user->two_factor_method, $identity->destination($user) ?? '');
            } catch (RuntimeException) {
                return $this->json(['ok' => false, 'error' => 'Could not send a code. Wait a minute before retrying, or use a recovery code.'], 503);
            }
            return $this->json(['ok' => true, ...$identity->describe($user)]);
        }, 1);
    }

    public function twoFactorLoginDelivery(Request $request): JsonResponse
    {
        try {
            $result = app(TwoFactorChallenge::class)->delivery(trim((string) $request->input('challengeId')),
                $request->boolean('send'));
        } catch (RuntimeException) {
            return $this->json(['ok' => false, 'error' => 'Could not send a code. Wait a minute before retrying, or use a recovery code.'], 503);
        }
        return $result ? $this->json(['ok' => true, ...$result])
            : $this->json(['ok' => false, 'error' => 'Verification expired. Sign in again.'], 401);
    }
}
