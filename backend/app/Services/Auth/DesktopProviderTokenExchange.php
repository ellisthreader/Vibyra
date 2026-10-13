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
            $payload['client_secret'] = app(AppleClientSecret::class)->make($settings);
        } else {
            throw new ProviderIdentityException('Unsupported desktop sign-in provider.');
        }

        $response = Http::asForm()->timeout(15)->post((string) ($settings['token_url'] ?? ''), $payload);
        $result = $response->json();
        $identityToken = is_array($result) ? trim((string) ($result['id_token'] ?? '')) : '';
        if (! $response->successful() || $identityToken === '') {
            throw new ProviderIdentityException('The provider could not complete this sign-in.');
        }

        return ['identityToken' => $identityToken, ...($provider === 'apple' && ($flow['purpose'] ?? null) === 'deletion'
            ? ['appleRevocationToken' => $result['refresh_token'] ?? $result['access_token'] ?? null,
                'appleRevocationHint' => isset($result['refresh_token']) ? 'refresh_token' : 'access_token'] : [])];
    }

}
