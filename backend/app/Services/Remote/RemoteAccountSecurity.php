<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, RemoteSession, User, VibyraSession};
use Illuminate\Support\Facades\DB;

/** Security-setting changes invalidate pending proof and established access. */
class RemoteAccountSecurity
{
    /** Host locks precede identity writes/FK locks, like passkey verification.
     * Each retry receives a fresh model because rolled-back saves clear dirty state. */
    public function updateIdentity(int $userId, callable $update, int $attempts = 3): mixed
    {
        return DB::transaction(function () use ($userId, $update) {
            RemoteHost::where('user_id', $userId)->orderBy('id')->lockForUpdate()->get();
            $user = User::whereKey($userId)->lockForUpdate()->firstOrFail();
            return $update($user);
        }, $attempts);
    }

    /** Account tokens and their remote disconnect outbox commit together. */
    public function revokeAppSessions(int $userId, ?array $ids, string $reason): int
    {
        return $this->updateIdentity($userId, function () use ($userId, $ids, $reason) {
            $revoked = VibyraSession::where('user_id', $userId)->whereNull('revoked_at')
                ->when($ids !== null, fn ($query) => $query->whereIn('id', $ids))->update([
                    'previous_token_hash' => null, 'previous_token_expires_at' => null,
                    'revoked_at' => now(), 'revocation_reason' => mb_substr($reason, 0, 80), 'updated_at' => now(),
                ]);
            $this->revoke($userId, $ids, $reason);
            return $revoked;
        });
    }

    public function revoke(int $userId, ?array $appSessionIds = null, string $reason = 'account_security_changed'): void
    {
        DB::transaction(function () use ($userId, $appSessionIds, $reason) {
            $ids = $appSessionIds ?? VibyraSession::where('user_id', $userId)->pluck('id')->all();
            // Use the same host→session lock order as admission and kill switch.
            $hosts = RemoteHost::where('user_id', $userId)->orderBy('id')->lockForUpdate()->get();
            if ($appSessionIds === null) foreach ($hosts as $host) app(RemoteRestrictions::class)->reset($host);
            $sessions = RemoteSession::where('user_id', $userId)->whereNull('ended_at')
                ->when($appSessionIds !== null, fn ($query) => $query->whereIn('app_session_id', $ids))->lockForUpdate()->get();
            foreach ($sessions as $remote) {
                $remote->forceFill(['status' => 'REVOKED', 'revoked_at' => now(), 'ended_at' => now()])->save();
                app(RemoteSessionRevocations::class)->queue($remote);
                if ($remote->host && (int) $remote->host->user_id === $userId) {
                    app(RemotePresence::class)->audit($remote->host, 'session.revoked', ['client' => $remote->client_name, 'reason' => $reason], $remote->trusted_device_id, $remote->id);
                }
            }
            DB::table('remote_strong_auth')->whereIn('app_session_id', $ids)->delete();
            foreach (['remote_device_challenges', 'remote_host_security_challenges'] as $table) {
                DB::table($table)->where('user_id', $userId)->when($appSessionIds !== null, fn ($query) => $query->whereIn('app_session_id', $ids))->delete();
            }
            DB::table('remote_passkey_ceremonies')->where('user_id', $userId)
                ->when($appSessionIds !== null, fn ($query) => $query->whereIn('app_session_id', $ids))->update(['consumed_at' => now(), 'invalidated_at' => now()]);
            DB::afterCommit(fn () => app(RemoteSessionRevocations::class)->deliver());
        }, 3);
    }
    /** Run before account cascades; this host outbox deliberately has no user FK. */
    public function revokeHostsForDeletion(int $userId): void
    {
        DB::transaction(function () use ($userId) {
            $hosts = RemoteHost::where('user_id', $userId)->orderBy('id')->lockForUpdate()->get();
            foreach ($hosts as $host) {
                app(RemoteRevocations::class)->queue($host->host_id, $host->authorization_generation + 1);
                DB::afterCommit(fn () => app(RemoteRevocations::class)->deliver($host->host_id));
            }
        });
    }

}
