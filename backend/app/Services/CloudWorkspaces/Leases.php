<?php
namespace App\Services\CloudWorkspaces;

final class Leases
{
    public function privateKey(): string
    {
        $key = base64_decode((string) config('cloud_workspaces.lease_private_key'), true);
        abort_unless($key !== false && strlen($key) === SODIUM_CRYPTO_SIGN_SECRETKEYBYTES, 503, 'Cloud compute signing is not configured.');
        return $key;
    }
    public function publicKey(): string
    {
        return base64_encode(sodium_crypto_sign_publickey_from_secretkey($this->privateKey()));
    }
    public function issue(object $w): array
    {
        $payload = base64_encode(json_encode(['workspace' => $w->id, 'generation' => $w->generation,
            'machine' => $w->machine_id, 'expires' => strtotime($w->lease_until.' UTC'), 'state' => $w->state], JSON_THROW_ON_ERROR));
        return ['payload' => $payload, 'signature' => base64_encode(sodium_crypto_sign_detached($payload, $this->privateKey()))];
    }
}
