<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, RemoteSession, TrustedDevice, VibyraSession};
use Illuminate\Support\Facades\DB;

class RemoteHostPolicy
{
    public function host(VibyraSession $session, string $id): RemoteHost
    {
        $host = RemoteHost::where('host_id', $id)->where('user_id', $session->user_id)->whereNull('revoked_at')->lockForUpdate()->first();
        if (! $host) throw new RemoteAccessException('That computer is not available.', 404);
        return $host;
    }

    public function describe(RemoteHost $host): array
    {
        return ['hostId' => $host->host_id, 'securityVersion' => 1, 'mode' => $host->remote_access_mode,
            'securityRevision' => (int) $host->security_revision,
            'enabled' => $host->remote_access_mode !== 'disabled', 'requireStrongAuthentication' => true, 'newDevicesRequireApproval' => true];
    }

    public function challenge(VibyraSession $session, string $hostId, string $mode): array
    {
        $this->mode($mode);
        return DB::transaction(fn () => app(RemoteHostSecurityProof::class)->issue($session, $this->host($session, $hostId), 'policy', $hostId, ['mode' => $mode]));
    }

    public function change(VibyraSession $session, string $hostId, string $mode, ?string $id, ?string $proof): array
    {
        $this->mode($mode);
        $result = DB::transaction(function () use ($session, $hostId, $mode, $id, $proof) {
            $host = $this->host($session, $hostId);
            if ($mode !== 'disabled') app(RemoteHostSecurityProof::class)->consume($session, $host, 'policy', $hostId, ['mode' => $mode], $id ?? '', $proof ?? '');
            if ($mode === 'disabled') $this->disable($host);
            else {
                $host->forceFill(['remote_access_mode' => $mode, 'security_enabled_at' => now()])->save();
                app(RemoteRestrictions::class)->enable($host);
            }
            app(RemotePresence::class)->audit($host, $mode === 'disabled' ? 'remote.disabled' : 'remote.enabled', ['mode' => $mode]);
            return $this->describe($host);
        });
        app(RemoteSessionRevocations::class)->deliver();
        return $result;
    }

    public function disableAll(VibyraSession $session): array
    {
        $count = DB::transaction(function () use ($session) {
            \App\Models\User::whereKey($session->user_id)->lockForUpdate()->firstOrFail();
            $hosts = RemoteHost::where('user_id', $session->user_id)->whereNull('revoked_at')->orderBy('id')->lockForUpdate()->get();
            foreach ($hosts as $host) {
                $this->disable($host);
                app(RemotePresence::class)->audit($host, 'remote.disabled');
            }
            return $hosts->count();
        });
        app(RemoteSessionRevocations::class)->deliver();
        return ['disabled' => true, 'computers' => $count];
    }

    private function disable(RemoteHost $host): void
    {
        app(RemoteRestrictions::class)->disable($host);
        $host->forceFill(['remote_access_mode' => 'disabled'])->save();
        $sessions = RemoteSession::where('remote_host_id', $host->id)->whereNull('ended_at')->lockForUpdate()->get();
        foreach ($sessions as $remote) {
            $remote->forceFill(['status' => 'REVOKED', 'revoked_at' => now(), 'ended_at' => now()])->save();
            app(RemoteSessionRevocations::class)->queue($remote);
        }
        $devices = TrustedDevice::where('remote_host_id', $host->id)->pluck('id');
        TrustedDevice::where('remote_host_id', $host->id)->whereNull('approved_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);
        DB::table('remote_device_challenges')->whereIn('trusted_device_id', $devices)->delete();
        DB::table('remote_strong_auth')->whereIn('trusted_device_id', $devices)->delete();
        DB::table('remote_passkey_ceremonies')->whereIn('trusted_device_id', $devices)->update(['consumed_at' => now(), 'invalidated_at' => now()]);
        DB::table('remote_host_security_challenges')->where('remote_host_id', $host->id)->delete();
    }

    private function mode(string $mode): void
    {
        if (! in_array($mode, ['ask', 'trusted', 'disabled'], true)) throw new RemoteAccessException('Choose a remote access mode.', 422);
    }
}
