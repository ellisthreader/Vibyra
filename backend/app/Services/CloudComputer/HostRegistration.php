<?php
namespace App\Services\CloudComputer;

use App\Models\{RemoteHost, User};
use App\Services\Remote\{RelayTokens, RemoteAccess, RemoteAccessException, RemoteIdentityProof, RemotePresence, RemoteRestrictions};
use Illuminate\Support\Facades\DB;

/**
 * The VM Host registering as the account's cloud computer. The owner comes from the
 * workspace (runtime bearer), never from a user token, and the existing Noise-key
 * sealed-box proof (RemoteIdentityProof) is the only way in. A host key that already
 * belongs to another account, or to a Mac, can never be registered here.
 */
class HostRegistration
{
    /** Identity challenges are bound to a per-workspace pseudo app session id (real session ids are small). */
    public static function pseudoSession(object $w): int
    {
        return (int) hexdec(substr(hash('sha256', 'cloud-computer:'.$w->id), 0, 10));
    }

    public function challenge(object $w, string $hostId): array
    {
        $this->bindable($w, $hostId);
        return app(RemoteIdentityProof::class)->challenge($this->owner($w), self::pseudoSession($w), $hostId, 'register');
    }

    public function register(object $w, array $d): array
    {
        $user = $this->owner($w);
        if (!app(RemoteAccess::class)->availability($user)['live']) throw new RemoteAccessException('Remote access is not available yet.', 503);
        return DB::transaction(function () use ($w, $d, $user) {
            DB::table('cloud_workspaces')->where('id', $w->id)->lockForUpdate()->firstOrFail();
            $w = DB::table('cloud_workspaces')->where('id', $w->id)->first();
            $this->bindable($w, $d['hostId']);
            $before = RemoteHost::where('host_id', $d['hostId'])->first();
            $freshBind = !$before || $before->revoked_at !== null || (int) $w->remote_host_id !== (int) $before->id;
            $reply = app(RemoteAccess::class)->register($user, $d['hostId'], trim($d['name']), $d['platform'] ?? 'cloud', $d['version'] ?? null,
                self::pseudoSession($w), $d['challengeId'] ?? null, $d['proof'] ?? null);
            $host = RemoteHost::where('host_id', $d['hostId'])->lockForUpdate()->firstOrFail();
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['remote_host_id' => $host->id]);
            if ($freshBind) $this->policy($host, $w, (bool) ($d['wantTrusted'] ?? false));
            $ttl = (int) config('remote.host_token_seconds');
            $reply['token'] = app(RelayTokens::class)->mint(['generation' => $host->authorization_generation, 'appSessionId' => self::pseudoSession($w),
                'role' => 'host', 'hostId' => $host->host_id, 'userId' => (string) $user->id, 'cloudWorkspace' => $w->id], $ttl);
            $reply['host'] = $reply['host'] + ['kind' => 'cloud', 'workspaceId' => $w->id];
            // The headless Host admits a phone without a local prompt only when told so here, and only alongside a signed grant.
            $reply['hostPolicy'] = (string) $host->fresh()->remote_access_mode;
            return $reply;
        });
    }

    /**
     * Trusted only for a first bind, only after a valid proof, scoped to this remote_host_id and its
     * ownership generation. Phones still need device proof + a fresh passkey. A later user choice
     * (ask/disabled) is never re-upgraded by a reboot.
     */
    private function policy(RemoteHost $host, object $w, bool $trusted): void
    {
        app(RemoteRestrictions::class)->enable($host);
        $host->forceFill(['remote_access_mode' => $trusted ? 'trusted' : 'ask', 'security_enabled_at' => now()])->save();
        app(RemotePresence::class)->audit($host, 'host.cloud_registered', ['workspace' => $w->id, 'mode' => $host->remote_access_mode,
            'generation' => $host->authorization_generation]);
    }

    private function bindable(object $w, string $hostId): void
    {
        if (($w->kind ?? 'project') !== 'computer') throw new RemoteAccessException('This workspace is not a cloud computer.', 403, 'not_cloud_computer');
        $host = RemoteHost::where('host_id', $hostId)->first();
        if ($host && (string) $host->user_id !== (string) $w->user_id) {
            throw new RemoteAccessException('This computer identity belongs to another account.', 409, 'host_transfer_required');
        }
        if ($host) {
            if ((int) $w->remote_host_id !== (int) $host->id) throw new RemoteAccessException('This computer identity is already registered elsewhere.', 409, 'host_key_conflict');
            return;
        }
        if ($w->remote_host_id) {
            $linked = RemoteHost::find($w->remote_host_id);
            if ($linked && $linked->revoked_at === null) throw new RemoteAccessException('Remove the old cloud computer identity before registering a new one.', 409, 'host_key_changed');
        }
    }

    private function owner(object $w): User
    {
        return User::findOrFail($w->user_id);
    }
}
