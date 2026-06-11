<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Http;

class DesktopProviderTokenExchange
{
    public function exchange(string $provider, string $code, array $flow): array
    {
        if ($code === '') {
            throw new ProviderIdentityException('The provider did not return an authorization code.');
        }

        $settings = (array) config("services.{$provider}_desktop_oauth", []);
        $payload = [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'client_id' => $settings['client_id'] ?? '',
            'redirect_uri' => $settings['redirect_uri'] ?? '',
        ];
        if ($provider === 'google') {
            $payload['code_verifier'] = $flow['verifier'] ?? '';
            if (! empty($settings['client_secret'])) {
                $payload['client_secret'] = $settings['client_secret'];
            }
        } elseif ($provider === 'apple') {
            $payload['client_secret'] = $this->appleClientSecret($settings);
        } else {
            throw new ProviderIdentityException('Unsupported desktop sign-in provider.');
        }

        $response = Http::asForm()->timeout(15)->post((string) ($settings['token_url'] ?? ''), $payload);
        $result = $response->json();
        $identityToken = is_array($result) ? trim((string) ($result['id_token'] ?? '')) : '';
        if (! $response->successful() || $identityToken === '') {
            throw new ProviderIdentityException('The provider could not complete this sign-in.');
        }

        return ['identityToken' => $identityToken];
    }

    private function appleClientSecret(array $settings): string
    {
        $configured = trim((string) ($settings['client_secret'] ?? ''));
        if ($configured !== '') {
            return $configured;
        }

        $teamId = trim((string) ($settings['team_id'] ?? ''));
        $keyId = trim((string) ($settings['key_id'] ?? ''));
        $privateKey = str_replace('\n', "\n", trim((string) ($settings['private_key'] ?? '')));
        if ($teamId === '' || $keyId === '' || $privateKey === '') {
            throw new ProviderIdentityException('Apple desktop sign-in is not fully configured.');
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
