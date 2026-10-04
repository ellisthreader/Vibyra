<?php

namespace App\Services\Remote\Passkeys;

use App\Models\VibyraSession;
use App\Services\Remote\RemoteAccessException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** A ceremony is authorized by device proof, then completed in the OS browser. */
class PasskeyCeremonies
{
    public function __construct(private readonly WebAuthnVerifier $verifier) {}

    /** Caller must consume an operation-bound device-possession challenge first. */
    public function begin(VibyraSession $session, int $deviceId, string $purpose): array
    {
        if (! in_array($purpose, ['register', 'authenticate'], true)) throw new RemoteAccessException('Invalid passkey operation.', 422);
        $device = $this->device($session, $deviceId);
        $server = $this->verifier->server();
        $credentials = DB::table('passkey_credentials')->where('user_id', $session->user_id)->whereNull('revoked_at')->get();
        if ($purpose === 'register') $this->assertRegistrationAllowed($session, $device);
        if ($purpose === 'authenticate' && $credentials->isEmpty()) throw new RemoteAccessException('Add a passkey on this approved device first.', 409, 'passkey_required');
        $ids = $credentials->map(fn ($row) => WebAuthnVerifier::decode($row->credential_id))->all();
        $options = $purpose === 'register'
            ? $server->getCreateArgs((string) $session->user_id, $session->user->email, $session->user->name ?: 'Vibyra user', 120, 'preferred', 'required', null, $ids)
            : $server->getGetArgs($ids, 120, true, true, true, true, true, 'required');
        $id = (string) Str::uuid();
        $secret = WebAuthnVerifier::encode(random_bytes(32));
        DB::table('remote_passkey_ceremonies')->insert([
            'id' => $id, 'user_id' => $session->user_id, 'app_session_id' => $session->id,
            'trusted_device_id' => $device->id, 'purpose' => $purpose,
            'secret_hash' => hash('sha256', $secret), 'challenge' => base64_encode($server->getChallenge()->getBinaryString()),
            'options' => json_encode($options, JSON_THROW_ON_ERROR),
            'expires_at' => now()->addSeconds(min(300, max(60, (int) config('remote_security.ceremony_seconds', 300)))), 'created_at' => now(),
        ]);
        // Fragment is never sent in an HTTP URL, Referer or access log. The
        // browser POSTs it once; it never receives the normal account bearer.
        return ['id' => $id, 'url' => config('remote_security.origin').'/remote/verify#'.http_build_query(['id' => $id, 'secret' => $secret])];
    }

    public function options(string $id, string $secret): array
    {
        $flow = $this->ticket($id, $secret);
        $session = VibyraSession::find($flow->app_session_id);
        $device = $this->device($session, $flow->trusted_device_id);
        return ['purpose' => $flow->purpose, 'deviceName' => $device->device_name,
            'options' => json_decode($flow->options, true, flags: JSON_THROW_ON_ERROR)];
    }

    public function finish(string $id, string $secret, array $credential): void
    {
        // Consume before verification so failed assertions cannot reuse a challenge.
        $flow = DB::transaction(function () use ($id, $secret) {
            $row = $this->ticket($id, $secret, true);
            $session = VibyraSession::find($row->app_session_id);
            $device = $this->device($session, $row->trusted_device_id);
            app(\App\Services\Remote\RemoteSecurityFailures::class)->check($session, $device->uuid, request()->ip());
            DB::table('remote_passkey_ceremonies')->where('id', $id)->update(['consumed_at' => now()]);
            return $row;
        });
        app(PasskeyVerification::class)->complete($flow, $credential);
    }

    public function status(VibyraSession $session, string $id): array
    {
        if (! Str::isUuid($id)) throw new RemoteAccessException('Verification was not found.', 404);
        $row = DB::table('remote_passkey_ceremonies')->where('id', $id)
            ->where('app_session_id', $session->id)->where('user_id', $session->user_id)->first();
        if (! $row) throw new RemoteAccessException('Verification was not found.', 404);
        $this->device($session, $row->trusted_device_id);
        return ['status' => $row->invalidated_at ? 'failed' : ($row->verified_at ? 'verified' : ($row->consumed_at ? 'failed' : (now()->gte($row->expires_at) ? 'expired' : 'waiting')))];
    }

    /** Rechecked at completion while the account row serializes all its registrations. */
    public function assertRegistrationAllowed(VibyraSession $session, object $device): void
    {
        if ($device->approved_at === null && ! app(\App\Services\CloudComputer\FirstCloudPasskey::class)->allows($session, $device)) {
            throw new RemoteAccessException('This device has not been approved for remote access.', 403);
        }
        $count = DB::table('passkey_credentials')->where('user_id', $session->user_id)->whereNull('revoked_at')->count();
        if ($count > 0 && ! $this->freshAssertion($session, $device)) {
            throw new RemoteAccessException('Verify with an existing passkey before adding another.', 403, 'strong_auth_required');
        }
        if ($count >= 10) throw new RemoteAccessException('Remove a passkey before adding another.', 409);
    }

    /** Same app session and device, an unrevoked passkey of this account, verified within the strong-auth window. */
    private function freshAssertion(VibyraSession $session, object $device): bool
    {
        $window = min(300, max(1, (int) config('remote_security.strong_auth_seconds', 300)));
        return DB::table('remote_strong_auth as a')->join('passkey_credentials as p', 'p.id', '=', 'a.passkey_credential_id')
            ->where('a.app_session_id', $session->id)->where('a.trusted_device_id', $device->id)
            ->where('p.user_id', $session->user_id)->whereNull('p.revoked_at')->where('a.expires_at', '>', now())
            ->where('a.verified_at', '>=', now()->subSeconds($window))->where('a.verified_at', '<=', now())->exists();
    }

    public function device(?VibyraSession $session, int $id): object
    {
        if (! $session || $session->revoked_at || ! $session->absolute_expires_at || ! $session->idle_expires_at
            || $session->absolute_expires_at->lte(now()) || $session->idle_expires_at->lte(now())) {
            throw new RemoteAccessException('Sign in again before verifying remote access.', 401);
        }
        $device = DB::table('trusted_devices as d')->join('remote_hosts as h', 'h.id', '=', 'd.remote_host_id')
            ->where('d.id', $id)->where('d.user_id', $session->user_id)->where('h.user_id', $session->user_id)
            ->where('h.remote_access_mode', '!=', 'disabled')->whereColumn('d.authorization_generation', 'h.authorization_generation')->whereNull('d.denied_at')
            ->whereNull('d.revoked_at')->whereNull('h.revoked_at')
            ->where(function ($q): void {
                $q->whereNotNull('d.approved_at')->orWhere(function ($q): void {
                    // Pending phone of a trusted cloud computer: it may start a passkey assertion to be approved by it.
                    $q->whereNull('d.approved_at')->where('d.request_expires_at', '>', now())->where('h.remote_access_mode', 'trusted')
                        ->whereExists(fn ($w) => $w->selectRaw('1')->from('cloud_workspaces as w')->whereColumn('w.remote_host_id', 'h.id')
                            ->whereColumn('w.user_id', 'h.user_id')->where('w.kind', 'computer')->where('w.state', '!=', 'deleted'));
                });
            })->select('d.*')->first();
        if (! $device) throw new RemoteAccessException('This device has not been approved for remote access.', 403);
        return $device;
    }

    private function ticket(string $id, string $secret, bool $lock = false): object
    {
        $row = Str::isUuid($id) ? DB::table('remote_passkey_ceremonies')->where('id', $id)->when($lock, fn ($q) => $q->lockForUpdate())->first() : null;
        if (strlen($secret) !== 43 || ! $row || ! hash_equals($row->secret_hash, hash('sha256', $secret))
            || $row->consumed_at !== null || $row->invalidated_at !== null || now()->gte($row->expires_at)) throw new RemoteAccessException('This verification expired. Start again in Vibyra.', 403);
        return $row;
    }
}
