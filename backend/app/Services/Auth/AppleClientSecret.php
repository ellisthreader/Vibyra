<?php

namespace App\Services\Auth;

final class AppleClientSecret
{
    public function make(array $settings): string
    {
        $configured = trim((string) ($settings['client_secret'] ?? ''));
        if ($configured !== '') {
            return $configured;
        }

        $teamId = trim((string) ($settings['team_id'] ?? ''));
        $keyId = trim((string) ($settings['key_id'] ?? ''));
        $privateKey = str_replace('\n', "\n", trim((string) ($settings['private_key'] ?? '')));
        if ($teamId === '' || $keyId === '' || $privateKey === '') {
            throw new ProviderIdentityException('Apple sign-in isn’t fully set up on this Vibyra server.');
        }

        $now = time();
        $header = $this->base64Url(json_encode(['alg' => 'ES256', 'kid' => $keyId]));
        $claims = $this->base64Url(json_encode([
            'iss' => $teamId,
            'iat' => $now,
            'exp' => $now + 300,
            'aud' => 'https://appleid.apple.com',
            'sub' => (string) ($settings['client_id'] ?? ''),
        ]));
        if (! openssl_sign("{$header}.{$claims}", $derSignature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new ProviderIdentityException('Apple desktop sign-in could not create a client secret.');
        }

        return "{$header}.{$claims}.".$this->base64Url($this->derToJose($derSignature, 64));
    }

    private function derToJose(string $der, int $length): string
    {
        $offset = 2;
        if (ord($der[1]) > 0x80) {
            $offset = 2 + (ord($der[1]) & 0x7f);
        }
        $rLength = ord($der[$offset + 1]);
        $r = substr($der, $offset + 2, $rLength);
        $offset += 2 + $rLength;
        $sLength = ord($der[$offset + 1]);
        $s = substr($der, $offset + 2, $sLength);

        return str_pad(ltrim($r, "\0"), $length / 2, "\0", STR_PAD_LEFT)
            .str_pad(ltrim($s, "\0"), $length / 2, "\0", STR_PAD_LEFT);
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
