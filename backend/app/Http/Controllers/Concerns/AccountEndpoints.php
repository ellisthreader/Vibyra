<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\ProviderIdentityVerifier;
use App\Services\Auth\ProviderChallengeService;
use App\Services\Auth\SessionTokenRotator;
use App\Services\SessionLocationResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

trait AccountEndpoints
{
    public function logoutCurrentSession(Request $request): JsonResponse
    {
        $session = $this->authenticatedSession($request);
        $session->revoke('logout');

        return $this->json(['ok' => true]);
    }

    public function rotateCurrentSession(Request $request): JsonResponse
    {
        $session = $this->authenticatedSession($request);
        $rotator = app(SessionTokenRotator::class);
        if (! $rotator->manualRotationEnabled()) {
            return $this->json(['ok' => false, 'error' => 'Session rotation is not enabled.'], 409);
        }
        if ($request->attributes->get('vibyra.session.used_previous_token') === true) {
            return $this->json(['ok' => false, 'error' => 'Use the current session token to rotate this session.'], 409);
        }

        try {
            $rotation = $rotator->rotate(
                $session,
                hash('sha256', (string) $request->bearerToken())
            );
        } catch (RuntimeException) {
            return $this->json(['ok' => false, 'error' => 'The session token changed. Retry with the current token.'], 409);
        }

        return $this->json([
            'ok' => true,
            'token' => $rotation['token'],
            'previousTokenGraceSeconds' => $rotation['previous_token_grace_seconds'],
        ]);
    }

    public function updateAccountSessionDevice(Request $request): JsonResponse
    {
        $session = $this->authenticatedSession($request);
        $deviceName = trim((string) $request->input('deviceName', ''));
        $installId = trim((string) $request->input('installId', ''));

        if ($deviceName === '') {
            return $this->json(['ok' => false, 'error' => 'Device name is required.'], 422);
        }

        $this->moderation->assertLocalTextAllowed($deviceName, 'account.session.device');
        $session->forceFill([
            'device_name' => mb_substr($deviceName, 0, 120),
            'device_identifier' => $installId === ''
                ? $session->device_identifier
                : mb_substr($installId, 0, 128),
        ])->save();

        return $this->json([
            'ok' => true,
            'device' => $this->accountSessionPayload($session->fresh() ?? $session, true),
        ]);
    }

    public function updateAccountProfile(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $name = trim((string) $request->input('name', $user->name));
        $email = $this->normalizeEmail($request->input('email', $user->email));

        if ($name === '' || ! $email) {
            return $this->json(['ok' => false, 'error' => 'Enter a display name and valid email.'], 422);
        }

        if ($email !== $user->email && User::where('email', $email)->where('id', '!=', $user->id)->exists()) {
            return $this->json(['ok' => false, 'error' => 'That email is already in use.'], 409);
        }
        if ($email !== $user->email && ($user->provider ?: 'email') !== 'email') {
            return $this->json(['ok' => false, 'error' => 'Change the email through your sign-in provider.'], 422);
        }

        $this->moderation->assertLocalTextAllowed($name, 'account.name');
        $emailChanged = $email !== $user->email;
        $user->forceFill([
            'name' => $name,
            'email' => $email,
            'email_verified_at' => $emailChanged ? null : $user->email_verified_at,
        ])->save();
        if ($emailChanged) {
            try {
                $user->sendEmailVerificationNotification();
            } catch (\Throwable) {
                // The email can be resent from the auth screen after a transient mail failure.
            }
        }

        return $this->json(['ok' => true, 'user' => $this->userPayload($user->fresh() ?? $user)]);
    }

    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if (($user->provider ?: 'email') === 'email') {
            $password = (string) $request->input('password', '');
            if ($password === '' || ! Hash::check($password, $user->password)) {
                return $this->json(['ok' => false, 'error' => 'Password is incorrect.'], 401);
            }
        } else {
            try {
                $nonce = $user->provider === 'apple'
                    ? app(ProviderChallengeService::class)->consume(
                        (string) $user->provider,
                        trim((string) $request->input('challengeId', ''))
                    )
                    : null;
                $identity = app(ProviderIdentityVerifier::class)->verify(
                    (string) $user->provider,
                    trim((string) $request->input('identityToken', '')),
                    $nonce,
                );
            } catch (ProviderIdentityException) {
                return $this->json(['ok' => false, 'error' => 'Reauthenticate with your provider before deleting this account.'], 401);
            }
            if (! hash_equals((string) $user->provider_id, $identity['subject'])) {
                return $this->json(['ok' => false, 'error' => 'The provider account does not match this Vibyra account.'], 403);
            }
        }

        $user->delete();

        return $this->json(['ok' => true]);
    }

    public function accountSessions(Request $request): JsonResponse
    {
        $current = $this->authenticatedSession($request);
        $sessions = $this->accountSessionQuery($current)
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->get();

        return $this->json([
            'ok' => true,
            'devices' => $this->sessionDevicePayloads($sessions, $current),
            'sessions' => $sessions->map(fn (VibyraSession $session) => $this->accountSessionPayload($session, $session->is($current)))->values()->all(),
        ]);
    }

    public function revokeAccountSession(Request $request, string $sessionId): JsonResponse
    {
        $current = $this->authenticatedSession($request);
        $session = VibyraSession::where('user_id', $current->user_id)
            ->whereNull('revoked_at')
            ->whereKey($sessionId)
            ->first();

        if (! $session) {
            return $this->json(['ok' => false, 'error' => 'Session not found.'], 404);
        }

        $currentRevoked = $session->is($current);
        $session->revoke($currentRevoked ? 'current_session_removed' : 'session_removed');

        return $this->json(['ok' => true, 'currentRevoked' => $currentRevoked]);
    }

    public function revokeAccountSessions(Request $request): JsonResponse
    {
        $current = $this->authenticatedSession($request);
        $revoked = $this->accountSessionQuery($current)->update([
            'previous_token_hash' => null,
            'previous_token_expires_at' => null,
            'revoked_at' => now(),
            'revocation_reason' => 'all_sessions_removed',
            'updated_at' => now(),
        ]);

        return $this->json(['ok' => true, 'revoked' => $revoked, 'currentRevoked' => true]);
    }

    public function revokeAccountDevice(Request $request, string $deviceId): JsonResponse
    {
        $current = $this->authenticatedSession($request);
        $sessions = $this->accountSessionQuery($current)->get();
        $deviceSessions = $sessions->filter(fn (VibyraSession $session) => $this->devicePublicId($session) === $deviceId);

        if ($deviceSessions->isEmpty()) {
            return $this->json(['ok' => false, 'error' => 'Device not found.'], 404);
        }

        $currentRevoked = $deviceSessions->contains(fn (VibyraSession $session) => $session->is($current));
        $revoked = VibyraSession::whereIn('id', $deviceSessions->pluck('id'))->update([
            'previous_token_hash' => null,
            'previous_token_expires_at' => null,
            'revoked_at' => now(),
            'revocation_reason' => 'device_removed',
            'updated_at' => now(),
        ]);

        return $this->json(['ok' => true, 'revoked' => $revoked, 'currentRevoked' => $currentRevoked]);
    }

    private function accountSessionQuery(VibyraSession $current)
    {
        return VibyraSession::where('user_id', $current->user_id)->whereNull('revoked_at');
    }

    private function sessionDevicePayloads($sessions, VibyraSession $current): array
    {
        return $sessions
            ->groupBy(fn (VibyraSession $session) => $this->deviceGroupKey($session))
            ->map(fn ($group) => $this->devicePayload($group, $current))
            ->sort(fn (array $a, array $b) => [$b['current'], $b['updatedAt']] <=> [$a['current'], $a['updatedAt']])
            ->values()
            ->all();
    }

    private function devicePayload($sessions, VibyraSession $current): array
    {
        $latest = $sessions->sortByDesc(fn (VibyraSession $session) => optional($session->last_used_at ?? $session->updated_at)->timestamp ?? 0)->first();
        $created = $sessions->sortBy(fn (VibyraSession $session) => optional($session->created_at)->timestamp ?? PHP_INT_MAX)->first();

        return [
            'id' => $this->devicePublicId($latest),
            'deviceName' => $latest->device_name ?: 'Vibyra device',
            'location' => $this->sessionLocation((string) $latest->ip_address),
            'ipAddress' => $latest->ip_address,
            'userAgent' => $latest->user_agent,
            'createdAt' => optional($created?->created_at)->toIso8601String(),
            'updatedAt' => optional($latest->last_used_at ?? $latest->updated_at)->toIso8601String(),
            'current' => $sessions->contains(fn (VibyraSession $session) => $session->is($current)),
            'sessionCount' => $sessions->count(),
        ];
    }

    private function accountSessionPayload(VibyraSession $session, bool $current): array
    {
        return [
            'id' => (string) $session->id,
            'deviceId' => $this->devicePublicId($session),
            'deviceName' => $session->device_name ?: 'Vibyra device',
            'location' => $this->sessionLocation((string) $session->ip_address),
            'ipAddress' => $session->ip_address,
            'userAgent' => $session->user_agent,
            'createdAt' => optional($session->created_at)->toIso8601String(),
            'updatedAt' => optional($session->last_used_at ?? $session->updated_at)->toIso8601String(),
            'idleExpiresAt' => optional($session->idle_expires_at)->toIso8601String(),
            'absoluteExpiresAt' => optional($session->absolute_expires_at)->toIso8601String(),
            'rotatedAt' => optional($session->rotated_at)->toIso8601String(),
            'current' => $current,
        ];
    }

    private function deviceGroupKey(VibyraSession $session): string
    {
        if ($session->device_identifier) {
            return 'install:'.$session->device_identifier;
        }

        return 'legacy:'.implode('|', [
            (string) $session->device_name,
            (string) $session->user_agent,
            (string) $session->ip_address,
        ]);
    }

    private function devicePublicId(VibyraSession $session): string
    {
        return hash('sha256', $this->deviceGroupKey($session));
    }

    private function sessionLocation(string $ip): string
    {
        return app(SessionLocationResolver::class)->labelForIp($ip);
    }
}
