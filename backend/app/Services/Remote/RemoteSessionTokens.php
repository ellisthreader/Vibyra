<?php

namespace App\Services\Remote;

/** Publicly verifiable grants: the relay cannot expand the Host's permissions. */
class RemoteSessionTokens
{
    public function publicKey(): string
    {
        return base64_encode(sodium_crypto_sign_publickey($this->keypair()));
    }

    public function mint(array $claims): string
    {
        $body = $this->encode(json_encode(['v' => 1] + $claims, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        $signature = sodium_crypto_sign_detached('ra1.'.$body, sodium_crypto_sign_secretkey($this->keypair()));
        return 'ra1.'.$body.'.'.$this->encode($signature);
    }

    private function keypair(): string
    {
        $configured = config('remote_security.signing_seed');
        if ($configured) {
            $seed = base64_decode((string) $configured, true);
            if ($seed === false || strlen($seed) !== SODIUM_CRYPTO_SIGN_SEEDBYTES) throw new RemoteAccessException('Remote signing is not configured.', 503);
        } else {
            $key = (string) config('app.key');
            $key = str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : $key;
            if (! is_string($key) || strlen($key) < 32) throw new RemoteAccessException('Remote signing is not configured.', 503);
            // HKDF is a standard domain-separated derivation. A dedicated seed
            // is preferred for independent rotation in deployed environments.
            $seed = hash_hkdf('sha256', $key, 32, 'Vibyra remote authorization signing v1');
        }
        return sodium_crypto_sign_seed_keypair($seed);
    }

    private function encode(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
