<?php

namespace App\Services\Remote;

use App\Models\{TrustedDevice, VibyraSession};
use Illuminate\Support\Facades\DB;

/**
 * One confirmation (passkey or Face ID) per remote visit, not per connection. A connection needs a confirmation of
 * this app session and device from the last five minutes, or a live visit: the same confirmation, at most
 * `visit_max_seconds` old, whose connections were last alive within `visit_idle_seconds`. Admission and every relay
 * renewal keep the visit alive. Revoking the device, session or account deletes the row and ends the visit.
 */
class RemoteVisit
{
    public function confirmed(VibyraSession $session, TrustedDevice $device): bool
    {
        $fresh = min(300, max(1, (int) config('remote_security.strong_auth_seconds', 300)));
        return $this->rows($session->id, $device->id, (int) $session->user_id)
            ->where(fn ($query) => $query
                ->where(fn ($recent) => $recent->where('a.expires_at', '>', now())->where('a.verified_at', '>=', now()->subSeconds($fresh)))
                ->orWhere(fn ($visit) => $visit->where('a.visit_until', '>', now())->where('a.verified_at', '>=', now()->subSeconds($this->max()))))
            ->where('a.verified_at', '<=', now())->exists();
    }

    /** Called once a connection of this visit is admitted or renewed. */
    public function touch(int $appSessionId, int $deviceId): void
    {
        $row = DB::table('remote_strong_auth')->where('app_session_id', $appSessionId)->where('trusted_device_id', $deviceId)->first();
        if (! $row) return;
        $until = min(now()->addSeconds($this->idle())->timestamp, \Illuminate\Support\Carbon::parse($row->verified_at)->addSeconds($this->max())->timestamp);
        if ($until <= now()->timestamp) return;
        DB::table('remote_strong_auth')->where('id', $row->id)->update(['visit_until' => \Illuminate\Support\Carbon::createFromTimestamp($until)]);
    }

    /** Face ID with the phone's Keychain key: the same confirmation as a passkey, without the web page. */
    public function confirmWithFace(VibyraSession $session, string $uuid, mixed $face): TrustedDevice
    {
        return DB::transaction(function () use ($session, $uuid, $face) {
            $device = app(RemoteDeviceProof::class)->owned($session, $uuid);
            if (! $device->trusted()) throw new RemoteAccessException('This device has not been approved for this computer.', 403, 'device_not_trusted');
            try { app(\App\Services\CloudComputer\FaceKeys::class)->verify($session, $face); }
            catch (\Illuminate\Http\Exceptions\HttpResponseException $refused) {
                $code = (string) ($refused->getResponse()->getData(true)['code'] ?? 'face_required');
                throw new RemoteAccessException($code === 'face_sign_in_required'
                    ? 'Sign out and sign in again on this iPhone to use Face ID.' : 'Confirm with Face ID to connect.', $refused->getResponse()->getStatusCode(), $code);
            }
            DB::table('remote_strong_auth')->updateOrInsert(['app_session_id' => $session->id, 'trusted_device_id' => $device->id],
                ['method' => 'face', 'passkey_credential_id' => null, 'verified_at' => now(), 'visit_until' => null,
                    'expires_at' => now()->addSeconds(min(300, max(1, (int) config('remote_security.strong_auth_seconds', 300))))]);
            app(SecurityEvents::class)->record($session->user_id, 'FACE_ID_VERIFIED', ['device' => $device->device_name], $device->remote_host_id, $device->id);
            return $device;
        });
    }

    private function rows(int $appSessionId, int $deviceId, int $userId)
    {
        // A passkey confirmation lasts while its passkey does; a Face ID one while this sign-in's Face ID key does.
        return DB::table('remote_strong_auth as a')
            ->leftJoin('passkey_credentials as p', 'p.id', '=', 'a.passkey_credential_id')
            ->where('a.app_session_id', $appSessionId)->where('a.trusted_device_id', $deviceId)
            ->where(fn ($query) => $query
                ->where(fn ($passkey) => $passkey->where('a.method', 'passkey')->where('p.user_id', $userId)->whereNull('p.revoked_at'))
                ->orWhere(fn ($face) => $face->where('a.method', 'face')->whereExists(fn ($key) => $key->select(DB::raw(1))
                    ->from('cloud_face_keys as f')->where('f.session_id', $appSessionId)->where('f.user_id', $userId))));
    }

    private function idle(): int { return max(60, (int) config('remote_security.visit_idle_seconds', 1800)); }
    private function max(): int { return max(300, min(43200, (int) config('remote_security.visit_max_seconds', 28800))); }
}
