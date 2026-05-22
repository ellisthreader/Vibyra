<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\SessionLocationResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

trait AccountEndpoints
{
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

        $this->moderation->assertLocalTextAllowed($name, 'account.name');
        $user->forceFill(['name' => $name, 'email' => $email])->save();

        return $this->json(['ok' => true, 'user' => $this->userPayload($user->fresh() ?? $user)]);
    }

    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $password = (string) $request->input('password', '');

        if ($password === '' || ! Hash::check($password, $user->password)) {
            return $this->json(['ok' => false, 'error' => 'Password is incorrect.'], 401);
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
        $session = VibyraSession::where('user_id', $current->user_id)->whereKey($sessionId)->first();

        if (! $session) {
            return $this->json(['ok' => false, 'error' => 'Session not found.'], 404);
        }

        $currentRevoked = $session->is($current);
        $session->delete();

        return $this->json(['ok' => true, 'currentRevoked' => $currentRevoked]);
    }

    public function revokeAccountSessions(Request $request): JsonResponse
    {
        $current = $this->authenticatedSession($request);
        $revoked = VibyraSession::where('user_id', $current->user_id)->delete();

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
        $revoked = VibyraSession::whereIn('id', $deviceSessions->pluck('id'))->delete();

        return $this->json(['ok' => true, 'revoked' => $revoked, 'currentRevoked' => $currentRevoked]);
    }

    private function accountSessionQuery(VibyraSession $current)
    {
        return VibyraSession::where('user_id', $current->user_id);
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
