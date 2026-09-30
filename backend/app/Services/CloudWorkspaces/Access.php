<?php
namespace App\Services\CloudWorkspaces;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Http\Request;

final class Access
{
    public function issue(object $w, VibyraSession $session, object $device): string
    {
        return Crypt::encryptString(json_encode(['workspace' => $w->id, 'user' => (int) $w->user_id, 'session' => $session->id,
            'device' => $device->id, 'deviceGeneration' => $device->authorization_generation, 'generation' => $w->generation,
            'expires' => min(now()->addHours(8)->timestamp, $session->absolute_expires_at->timestamp)], JSON_THROW_ON_ERROR));
    }
    public function verify(Request $request, object $w): array
    {
        try { $data = json_decode(Crypt::decryptString((string) $request->header('X-Vibyra-Cloud-Access')), true, flags: JSON_THROW_ON_ERROR); }
        catch (\Throwable) { abort(403, 'Authorize this device for the cloud computer first.'); }
        abort_unless(is_array($data) && count(array_intersect(['workspace', 'user', 'session', 'device', 'deviceGeneration', 'generation', 'expires'], array_keys($data))) === 7, 403, 'Invalid cloud authorization.');
        $session = app(\App\Services\Auth\SessionAuthenticator::class)->authenticate((string) $request->bearerToken())['session'] ?? null;
        // Match current account session, not an account-only bearer or another device's capability.
        abort_unless($session && $session->id == $data['session'] && $session->user_id == $data['user'] && $data['workspace'] === $w->id
            && $data['user'] === (int) $w->user_id && $data['generation'] === $w->generation && $data['expires'] > now()->timestamp
            && !$session->revoked_at && $session->absolute_expires_at && now()->lt($session->absolute_expires_at)
            && $session->idle_expires_at && now()->lt($session->idle_expires_at), 403, 'This cloud authorization expired or changed.');
        abort_unless($this->deviceActive($data['device'], $data['deviceGeneration'], $w->user_id), 403, 'This device authorization was revoked.');
        return $data;
    }
    public function deviceActive(int $id, int $generation, int $user): bool
    {
        return DB::table('trusted_devices as d')->join('remote_hosts as h', 'h.id', '=', 'd.remote_host_id')
            ->where('d.id', $id)->where('d.user_id', $user)->where('h.user_id', $user)->where('d.authorization_generation', $generation)
            ->whereColumn('d.authorization_generation', 'h.authorization_generation')->whereNull('d.revoked_at')->whereNull('d.denied_at')
            ->whereNotNull('d.approved_at')->whereNull('h.revoked_at')->where('h.remote_access_mode', '!=', 'disabled')->exists();
    }
}
