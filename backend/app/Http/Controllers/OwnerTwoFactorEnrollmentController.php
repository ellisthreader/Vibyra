<?php

namespace App\Http\Controllers;

use App\Http\Middleware\LocalOwnerAccess;
use App\Services\Auth\{DesktopProviderOAuthFlow, ProviderEnrollmentProof, ProviderIdentityException, TwoFactor};
use App\Services\Remote\RemoteAccountSecurity;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\Hash;

class OwnerTwoFactorEnrollmentController extends Controller
{
    private function owner(Request $request, bool $googleOnly = false)
    {
        $user = $request->user('web');
        abort_if(! $user || $user->email === LocalOwnerAccess::EMAIL
            || ! in_array($user->provider ?: 'email', $googleOnly ? ['google'] : ['email', 'google'], true), 403);
        return $user;
    }

    private function private(array $body, int $status = 200): JsonResponse
    {
        return response()->json($body, $status)->header('Cache-Control', 'private, no-store');
    }

    public function providerStart(Request $request, DesktopProviderOAuthFlow $flows, TwoFactor $twoFactor): JsonResponse
    {
        $user = $this->owner($request, true);
        $input = $request->validate(['provider' => 'required|in:google']);
        if ($twoFactor->enabled($user)) {
            return $this->private(['ok' => false, 'error' => 'Two-factor authentication is already enabled.'], 409);
        }
        try {
            $flow = $flows->startEnrollment($input['provider'], (int) $user->id,
                (string) $user->provider_id, 'web', $request->session()->getId());
        } catch (ProviderIdentityException $error) {
            return $this->private(['ok' => false, 'error' => $error->getMessage()], 422);
        }
        return $this->private(['ok' => true, ...$flow]);
    }

    public function providerStatus(Request $request, string $flowId, DesktopProviderOAuthFlow $flows): JsonResponse
    {
        $user = $this->owner($request, true);
        try {
            $result = $flows->statusForEnrollment('google', $flowId, $user, 'web', $request->session()->getId());
        } catch (ProviderIdentityException) {
            return $this->private(['ok' => false, 'error' => 'This verification belongs to another session.'], 403);
        }
        return $this->private($result, ($result['status'] ?? null) === 'expired' ? 410 : 200);
    }

    public function start(Request $request, ProviderEnrollmentProof $proofs, TwoFactor $twoFactor): JsonResponse
    {
        $owner = $this->owner($request);
        $request->validate(['currentPassword' => 'sometimes|string|max:1024', 'enrollmentProof' => 'sometimes|string|max:256']);
        return app(RemoteAccountSecurity::class)->updateIdentity((int) $owner->id, function ($user) use ($request, $proofs, $twoFactor) {
            if ($twoFactor->enabled($user)) {
                return $this->private(['ok' => false, 'error' => 'Two-factor authentication is already enabled.'], 409);
            }
            if (($user->provider ?: 'email') === 'email') {
                if (! Hash::check((string) $request->input('currentPassword', ''), (string) $user->password)) {
                    return $this->private(['ok' => false, 'error' => 'That password did not match your Vibyra account. Try again, or reset your password.'], 403);
                }
            } elseif (($user->provider ?: 'email') !== 'google'
                || ! $proofs->claim($user, 'web', $request->session()->getId(), (string) $request->input('enrollmentProof', ''))) {
                return $this->private(['ok' => false, 'error' => 'Google verification expired. Try again.'], 403);
            }
            $secret = $twoFactor->start($user);
            $request->session()->put('owner_totp_setup_user_id', $user->id);
            $request->session()->put('owner_totp_setup_at', now()->timestamp);
            $request->session()->put('owner_totp_setup_hash', hash('sha256', (string) $user->two_factor_secret));
            return $this->private(['ok' => true, 'secret' => $secret,
                'uri' => $twoFactor->setupUri($user, $secret), 'account' => $user->email]);
        });
    }

    public function confirm(Request $request, TwoFactor $twoFactor): JsonResponse
    {
        $owner = $this->owner($request);
        $input = $request->validate(['code' => 'required|digits:6']);
        return app(RemoteAccountSecurity::class)->updateIdentity((int) $owner->id, function ($user) use ($request, $input, $twoFactor) {
            $setupAt = $request->session()->get('owner_totp_setup_at');
            if ((int) $request->session()->get('owner_totp_setup_user_id') !== (int) $user->id
                || ! is_numeric($setupAt) || (int) $setupAt < now()->subMinutes(10)->timestamp
                || ! hash_equals((string) $request->session()->get('owner_totp_setup_hash', ''), hash('sha256', (string) $user->two_factor_secret))) {
                return $this->private(['ok' => false, 'error' => 'Setup expired. Verify your identity again.'], 403);
            }
            $codes = $twoFactor->confirm($user, $input['code']);
            if ($codes === null) {
                return $this->private(['ok' => false, 'error' => 'That code did not match. Try the current code.'], 422);
            }
            app(RemoteAccountSecurity::class)->revoke((int) $user->id, reason: 'two_factor_enabled');
            $request->session()->forget(['owner_totp_setup_user_id', 'owner_totp_setup_at', 'owner_totp_setup_hash']);
            return $this->private(['ok' => true, 'enabled' => true, 'recoveryCodes' => $codes]);
        });
    }
}
