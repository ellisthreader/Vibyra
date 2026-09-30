<?php

namespace App\Services\Remote;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Structured metadata only: content and credential fields are never accepted. */
class SecurityEvents
{
    private const TITLES = [
        'DEVICE_PAIRING_REQUESTED' => 'New device requested remote access',
        'DEVICE_APPROVED' => 'Remote device approved', 'DEVICE_DENIED' => 'Remote device denied', 'DEVICE_REVOKED' => 'Remote device revoked',
        'REMOTE_SESSION_REQUESTED' => 'Remote session requested', 'REMOTE_SESSION_AUTHORIZED' => 'Remote session authorized',
        'REMOTE_SESSION_STARTED' => 'Remote access started', 'REMOTE_SESSION_ENDED' => 'Remote access ended',
        'REMOTE_SESSION_REVOKED' => 'Remote session disconnected', 'REMOTE_SESSION_DENIED' => 'Remote session denied',
        'PASSKEY_AUTH_SUCCESS' => 'Passkey verified', 'PASSKEY_AUTH_FAILURE' => 'Passkey verification failed',
        'PASSKEY_ADDED' => 'Passkey added', 'PASSKEY_REMOVED' => 'Passkey removed',
        'REMOTE_ACCESS_DISABLED' => 'Remote access disabled', 'REMOTE_ACCESS_ENABLED' => 'Remote access enabled',
        'REMOTE_ACCESS_FAILURES' => 'Repeated remote access attempts', 'PASSWORD_CHANGED' => 'Password changed',
    ];

    public function record(int $user, string $event, array $metadata = [], ?int $host = null, ?int $device = null, ?int $session = null): int
    {
        if (! isset(self::TITLES[$event])) throw new \InvalidArgumentException('Unknown security event');
        $safe = [];
        foreach (['computer', 'device', 'client', 'reason', 'country'] as $key) {
            if (isset($metadata[$key]) && is_string($metadata[$key])) $safe[$key] = mb_substr(preg_replace('/[\x00-\x1f\x7f]/u', '', $metadata[$key]), 0, 80);
        }
        if (isset($metadata['count']) && is_int($metadata['count'])) $safe['count'] = min(100000, max(0, $metadata['count']));
        $request = request();
        $clientRequest = $request->is('api/*') && ! $request->is('api/remote/relay/*');
        $id = DB::table('security_events')->insertGetId(['uuid' => (string) Str::uuid(), 'user_id' => $user,
            'desktop_id' => $host, 'trusted_device_id' => $device, 'remote_session_id' => $session,
            'ip_address' => $clientRequest ? $request->ip() : null,
            'user_agent' => $clientRequest ? mb_substr(preg_replace('/[\x00-\x1f\x7f]/u', '', $request->userAgent() ?? ''), 0, 255) : null,
            'event_type' => $event, 'metadata' => json_encode($safe, JSON_THROW_ON_ERROR), 'created_at' => now()]);
        // Security warnings have their own queue; work-progress preferences
        // must not silently suppress an active remote-access alert.
        if (in_array($event, ['DEVICE_PAIRING_REQUESTED', 'DEVICE_APPROVED', 'DEVICE_REVOKED', 'REMOTE_SESSION_STARTED', 'REMOTE_ACCESS_DISABLED',
            'REMOTE_ACCESS_ENABLED', 'REMOTE_ACCESS_FAILURES', 'PASSWORD_CHANGED', 'PASSKEY_ADDED', 'PASSKEY_REMOVED'], true)) {
            app(SecurityNotifications::class)->enqueue($id, $user);
        }
        return $id;
    }

    public function legacy(int $user, string $event, array $metadata, int $host, ?int $device = null, ?int $session = null): void
    {
        $type = match ($event) {
            'device.pairing_requested' => 'DEVICE_PAIRING_REQUESTED', 'device.approved' => 'DEVICE_APPROVED',
            'device.denied' => 'DEVICE_DENIED', 'device.revoked' => 'DEVICE_REVOKED',
            'session.requested' => 'REMOTE_SESSION_REQUESTED', 'session.authorized' => 'REMOTE_SESSION_AUTHORIZED',
            'session.started' => 'REMOTE_SESSION_STARTED', 'session.ended' => 'REMOTE_SESSION_ENDED',
            'session.revoked' => 'REMOTE_SESSION_REVOKED', 'session.denied' => 'REMOTE_SESSION_DENIED',
            'remote.disabled', 'host.removed' => 'REMOTE_ACCESS_DISABLED', 'remote.enabled' => 'REMOTE_ACCESS_ENABLED',
            default => null,
        };
        if ($type) $this->record($user, $type, $metadata, $host, $device, $session);
    }

    public function title(string $event): string { return self::TITLES[$event] ?? 'Vibyra security update'; }
}
