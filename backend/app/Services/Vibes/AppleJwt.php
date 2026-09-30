<?php

namespace App\Services\Vibes;

use RuntimeException;

/**
 * ES256 tokens for Apple's APIs. Both the App Store Server API and DeviceCheck
 * want the same shape signed with a different key and different claims, and the
 * DER-to-JOSE conversion below is the sort of thing that must exist once.
 */
class AppleJwt
{
    public function sign(string $key, string $keyId, array $claims): string
    {
        $head = $this->encode(json_encode(['alg' => 'ES256', 'kid' => $keyId, 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $body = $this->encode(json_encode($claims, JSON_THROW_ON_ERROR));
        if (!openssl_sign($head.'.'.$body, $signature, str_replace('\\n', "\n", $key), OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Apple signing key could not be used.');
        }
        // OpenSSL returns DER integers; JWT ES256 requires 32-byte r followed by 32-byte s.
        $offset = 2; $raw = '';
        for ($i = 0; $i < 2; $i++) {
            if (ord($signature[$offset++]) !== 2) throw new RuntimeException('Invalid EC signature.');
            $length = ord($signature[$offset++]);
            $integer = ltrim(substr($signature, $offset, $length), "\0"); $offset += $length;
            if (strlen($integer) > 32) throw new RuntimeException('Invalid ES256 key.');
            $raw .= str_pad($integer, 32, "\0", STR_PAD_LEFT);
        }
        return $head.'.'.$body.'.'.$this->encode($raw);
    }

    private function encode(string $data): string { return rtrim(strtr(base64_encode($data), '+/', '-_'), '='); }
}
