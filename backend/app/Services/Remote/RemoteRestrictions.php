<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, TrustedDevice, VibyraSession};
use Illuminate\Support\Facades\{DB, RateLimiter};

/** Restrictive reconciliation only: polling never grants local access or trust. */
class RemoteRestrictions
{
    public const MAX_REVISION = 9007199254740991;

    /** All mutations run under the same host row lock as admission/approval. */
    public function advance(RemoteHost $host, array $changes = []): int
    {
        $revision = (int) $host->security_revision + 1;
        if ($revision > self::MAX_REVISION) throw new RemoteAccessException('Computer security state is unavailable.', 503);
        $host->forceFill(['security_revision' => $revision] + $changes)->save();
        return $revision;
    }

    public function disable(RemoteHost $host): void
    {
        $revision = $this->advance($host);
        $host->forceFill(['disable_revision' => $revision])->save();
    }

    public function reset(RemoteHost $host): int
    {
        $revision = $this->advance($host);
        $host->forceFill(['reset_revision' => $revision])->save();
        return $revision;
    }

    public function enable(RemoteHost $host): void
    {
        $this->advance($host, ['disable_revision' => 0]);
    }

    public function ownershipChanged(RemoteHost $host): void
    {
        $this->advance($host, ['disable_revision' => 0, 'reset_revision' => 0]);
        TrustedDevice::where('remote_host_id', $host->id)->update(['approved_revision' => 0, 'revocation_revision' => 0]);
    }

    public function snapshot(VibyraSession $app, string $hostId, int $after = 0, ?int $at = null): array
    {
        return DB::transaction(function () use ($app, $hostId, $after, $at) {
            $host = RemoteHost::where('host_id', $hostId)->where('user_id', $app->user_id)->whereNull('revoked_at')->lockForUpdate()->first();
            if (! $host) throw new RemoteAccessException('That computer is not available.', 404);
            $revision = (int) $host->security_revision;
            if ($revision < 0 || $revision > self::MAX_REVISION || $host->authorization_generation < 1
                || $host->authorization_generation > self::MAX_REVISION) throw new RemoteAccessException('Computer security state is unavailable.', 503);
            if ($after < 0 || $after > $revision || ($at !== null && $at !== $revision)) {
                throw new RemoteAccessException('Computer security state changed. Retry the current page.', 409, 'control_revision_changed');
            }
            $devices = TrustedDevice::where('remote_host_id', $host->id)->where('user_id', $app->user_id);
            $approved = (clone $devices)->where('authorization_generation', $host->authorization_generation)
                ->whereNotNull('approved_at')->whereNull('revoked_at')->whereNull('denied_at')->limit(65)->get();
            if ($approved->count() > 64) throw new RemoteAccessException('Computer trust state needs review.', 503);
            // Same-owner re-enrollment retains revocation floors, including
            // older device generations. Ownership transfer clears those floors.
            $revoked = (clone $devices)->where('revocation_revision', '>', $after)->orderBy('revocation_revision')->limit(101)->get();
            $more = $revoked->count() > 100; $page = $revoked->take(100);
            if ($revoked->contains(fn ($d) => $d->revocation_revision > $revision)
                || ($more && $page->last()->revocation_revision === $revoked->last()->revocation_revision)) {
                throw new RemoteAccessException('Computer revocation state needs review.', 503);
            }
            return ['hostId' => $host->host_id, 'userId' => (string) $app->user_id, 'generation' => $host->authorization_generation,
                'revision' => $revision, 'disableRevision' => (int) $host->disable_revision, 'resetRevision' => (int) $host->reset_revision,
                'approvedDevices' => $approved->map(fn ($d) => ['publicKey' => $d->public_key, 'revision' => (int) $d->approved_revision])->all(),
                'revokedDevices' => $page->map(fn ($d) => ['publicKey' => $d->public_key, 'revision' => (int) $d->revocation_revision])->values()->all(),
                'nextRevision' => $more ? (int) $page->last()->revocation_revision : $revision, 'hasMore' => $more];
        });
    }

    public function rateLimit(VibyraSession $app, string $hostId, ?string $ip): void
    {
        $keys = ['remote:controls:account:'.$app->user_id => 120,
            'remote:controls:host:'.hash('sha256', $app->user_id.':'.$hostId) => 24,
            'remote:controls:ip:'.hash('sha256', $ip ?? '') => 240];
        foreach ($keys as $key => $limit) if (RateLimiter::tooManyAttempts($key, $limit)) {
            throw new RemoteAccessException('Wait before checking computer security again.', 429);
        }
        foreach ($keys as $key => $limit) RateLimiter::hit($key, 60);
    }
}
