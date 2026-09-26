<?php

namespace App\Http\Controllers;

use App\Http\Middleware\LocalOwnerAccess;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Auth\ProviderEnrollmentProof;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\TwoFactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerTwoFactorEnrollmentController extends Controller
{
    private function owner(Request $request)
    {
        $user = $request->user('web');
        abort_if(! $user || $user->email === LocalOwnerAccess::EMAIL
            || ($user->provider ?: 'email') !== 'google'
            || trim((string) $user->provider_id) === '', 403);

        return $user;
    }

    private function private(array $body, int $status = 200): JsonResponse
    {
        return response()->json($body, $status)->header('Cache-Control', 'private, no-store');
    }

    public function providerStart(Request $request, DesktopProviderOAuthFlow $flows,
        TwoFactor $twoFactor): JsonResponse
    {
        $user = $this->owner($request);
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

    public function providerStatus(Request $request, string $flowId,
        DesktopProviderOAuthFlow $flows): JsonResponse
    {
        $user = $this->owner($request);
        try {
            $result = $flows->statusForEnrollment('google', $flowId, $user,
                'web', $request->session()->getId());
        } catch (ProviderIdentityException) {
            return $this->private(['ok' => false, 'error' => 'This verification belongs to another session.'], 403);
        }

        return $this->private($result, ($result['status'] ?? null) === 'expired' ? 410 : 200);
    }

    public function start(Request $request, ProviderEnrollmentProof $proofs,
        TwoFactor $twoFactor): JsonResponse
    {
        $user = $this->owner($request);
        $input = $request->validate(['enrollmentProof' => 'required|string|max:256']);
        if ($twoFactor->enabled($user)) {
            return $this->private(['ok' => false, 'error' => 'Two-factor authentication is already enabled.'], 409);
        }
        if (! $proofs->claim($user, 'web', $request->session()->getId(), $input['enrollmentProof'])) {
            return $this->private(['ok' => false, 'error' => 'Google verification expired. Try again.'], 403);
        }

        $secret = $twoFactor->start($user);
        $request->session()->put('owner_totp_setup_user_id', $user->id);
        $request->session()->put('owner_totp_setup_at', now()->timestamp);

        return $this->private(['ok' => true, 'secret' => $secret,
            'uri' => $twoFactor->setupUri($user, $secret), 'account' => $user->email]);
    }

    public function confirm(Request $request, TwoFactor $twoFactor): JsonResponse
    {
        $user = $this->owner($request);
        $setupAt = $request->session()->get('owner_totp_setup_at');
        if ((int) $request->session()->get('owner_totp_setup_user_id') !== (int) $user->id
            || ! is_numeric($setupAt) || (int) $setupAt < now()->subMinutes(10)->timestamp) {
            return $this->private(['ok' => false, 'error' => 'Setup expired. Verify with Google again.'], 403);
        }
        $input = $request->validate(['code' => 'required|digits:6']);
        $codes = $twoFactor->confirm($user, $input['code']);
        if ($codes === null) {
            return $this->private(['ok' => false, 'error' => 'That code did not match. Try the current code.'], 422);
        }
        $request->session()->forget(['owner_totp_setup_user_id', 'owner_totp_setup_at']);

        return $this->private(['ok' => true, 'enabled' => true, 'recoveryCodes' => $codes]);
    }
}
