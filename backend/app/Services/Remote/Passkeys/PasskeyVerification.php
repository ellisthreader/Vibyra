<?php

namespace App\Services\Remote\Passkeys;

use App\Models\VibyraSession;
use App\Services\Remote\RemoteAccessException;
use Illuminate\Support\Facades\DB;

class PasskeyVerification
{
    public function complete(object $flow, array $credential): void
    {
        try {
            DB::transaction(function () use ($flow, $credential): void {
                // Match the host→account session→device→ceremony→passkey lock order.
                $hostId = DB::table('trusted_devices')->where('id', $flow->trusted_device_id)->value('remote_host_id');
                DB::table('remote_hosts')->where('id', $hostId)->lockForUpdate()->first();
                $session = VibyraSession::whereKey($flow->app_session_id)->lockForUpdate()->first();
                DB::table('trusted_devices')->where('id', $flow->trusted_device_id)->lockForUpdate()->first();
                $device = app(PasskeyCeremonies::class)->device($session, $flow->trusted_device_id);
                $current = DB::table('remote_passkey_ceremonies')->where('id', $flow->id)->lockForUpdate()->first();
                if (! $current || $current->invalidated_at || $current->verified_at || ! $current->consumed_at || now()->gte($current->expires_at)) {
                    throw new RemoteAccessException('This verification expired. Start again in Vibyra.', 403);
                }
                $verifier = app(WebAuthnVerifier::class);
                $server = $verifier->server();
                $client = $verifier->clientData($credential, $flow->purpose);
                $id = WebAuthnVerifier::decode($credential['id'] ?? null, 2048);
                if (isset($credential['rawId']) && ! hash_equals($id, WebAuthnVerifier::decode($credential['rawId'], 2048))) throw new \RuntimeException('Credential mismatch');
                $response = $credential['response'];
                $challenge = base64_decode($flow->challenge, true);
                if ($flow->purpose === 'register') {
                    $result = $server->processCreate($client, WebAuthnVerifier::decode($response['attestationObject'] ?? null), $challenge, true, true);
                    if (! hash_equals($result->credentialId, $id)) throw new \RuntimeException('Credential mismatch');
                    if (DB::table('passkey_credentials')->where('user_id', $session->user_id)->whereNull('revoked_at')->count() >= 10) throw new \RuntimeException('Passkey limit');
                    $credentialId = DB::table('passkey_credentials')->insertGetId([
                        'user_id' => $session->user_id, 'credential_hash' => hash('sha256', $id),
                        'credential_id' => WebAuthnVerifier::encode($id), 'public_key' => $result->credentialPublicKey,
                        'counter' => $result->signatureCounter ?? 0, 'device_name' => $device->device_name,
                        'transports' => json_encode(array_values(array_intersect((array) ($response['transports'] ?? []), ['usb', 'nfc', 'ble', 'internal', 'hybrid']))),
                        'created_at' => now(), 'updated_at' => now(), 'last_used_at' => now(),
                    ]);
                } else {
                    $key = DB::table('passkey_credentials')->where('credential_hash', hash('sha256', $id))
                        ->where('user_id', $session->user_id)->whereNull('revoked_at')->lockForUpdate()->first();
                    if (! $key) throw new \RuntimeException('Credential unavailable');
                    $options = json_decode($flow->options, true, flags: JSON_THROW_ON_ERROR);
                    $allowed = array_column($options['publicKey']['allowCredentials'] ?? [], 'id');
                    if (! in_array($key->credential_id, $allowed, true)) throw new \RuntimeException('Credential not requested');
                    if (isset($response['userHandle']) && $response['userHandle'] !== ''
                        && ! hash_equals((string) $session->user_id, WebAuthnVerifier::decode($response['userHandle'], 256))) throw new \RuntimeException('User mismatch');
                    $server->processGet($client, WebAuthnVerifier::decode($response['authenticatorData'] ?? null, 8192),
                        WebAuthnVerifier::decode($response['signature'] ?? null, 2048), $key->public_key,
                        $challenge, (int) $key->counter, true, true);
                    $credentialId = $key->id;
                    DB::table('passkey_credentials')->where('id', $key->id)->update([
                        'counter' => $server->getSignatureCounter() ?? 0, 'last_used_at' => now(), 'updated_at' => now(),
                    ]);
                }
                DB::table('remote_strong_auth')->updateOrInsert(
                    ['app_session_id' => $session->id, 'trusted_device_id' => $device->id],
                    ['passkey_credential_id' => $credentialId, 'verified_at' => now(),
                        'expires_at' => now()->addSeconds(min(300, max(1, (int) config('remote_security.strong_auth_seconds', 300))))],
                );
                DB::table('remote_passkey_ceremonies')->where('id', $flow->id)->update(['verified_at' => now()]);
                app(\App\Services\Remote\SecurityEvents::class)->record($session->user_id,
                    $flow->purpose === 'register' ? 'PASSKEY_ADDED' : 'PASSKEY_AUTH_SUCCESS',
                    ['device' => $device->device_name], $device->remote_host_id, $device->id);
            });
        } catch (\Throwable $error) {
            $session = VibyraSession::find($flow->app_session_id);
            $uuid = DB::table('trusted_devices')->where('id', $flow->trusted_device_id)->value('uuid');
            if ($session) app(\App\Services\Remote\RemoteSecurityFailures::class)->failure($session, $uuid, request()->ip());
            app(\App\Services\Remote\SecurityEvents::class)->record($flow->user_id, 'PASSKEY_AUTH_FAILURE', [], null, $flow->trusted_device_id);
            // Never return library details or assertion bytes to logs or clients.
            if ($error instanceof RemoteAccessException) throw $error;
            throw new RemoteAccessException('Passkey verification failed. Start again in Vibyra.', 422);
        }
    }
}
