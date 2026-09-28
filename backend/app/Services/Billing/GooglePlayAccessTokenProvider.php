<?php

namespace App\Services\Billing;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class GooglePlayAccessTokenProvider
{
    private const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

    public function token(): string
    {
        $credentials = $this->credentials();
        $cacheKey = 'google-iap-access-token:'.sha1($credentials['client_email']);

        return Cache::remember($cacheKey, 3300, function () use ($credentials): string {
            $now = time();
            $assertion = $this->encodeJwt(
                ['alg' => 'RS256', 'typ' => 'JWT'],
                [
                    'iss' => $credentials['client_email'],
                    'scope' => self::SCOPE,
                    'aud' => $credentials['token_uri'],
                    'iat' => $now,
                    'exp' => $now + 3600,
                ],
                $credentials['private_key']
            );
            $response = Http::timeout(15)->asForm()->post($credentials['token_uri'], [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $assertion,
            ]);
            $token = (string) $response->json('access_token');

            if (! $response->successful() || $token === '') {
                throw new RuntimeException(
                    "Google IAP authentication failed (status {$response->status()})."
                );
            }

            return $token;
        });
    }

    /**
     * @return array{client_email: string, private_key: string, token_uri: string}
     */
    private function credentials(): array
    {
        $raw = trim((string) config('services.google_iap.service_account_json'));
        if ($raw === '') {
            throw new RuntimeException('Google IAP service account is not configured.');
        }

        $json = $raw;
        if (! str_starts_with($raw, '{') && is_file($raw)) {
            $json = (string) file_get_contents($raw);
        } elseif (! str_starts_with($raw, '{')) {
            $decoded = base64_decode($raw, true);
            $json = $decoded === false ? $raw : $decoded;
        }

        $credentials = json_decode($json, true);
        $email = trim((string) ($credentials['client_email'] ?? ''));
        $privateKey = str_replace('\n', "\n", (string) ($credentials['private_key'] ?? ''));
        $tokenUri = trim((string) ($credentials['token_uri'] ?? 'https://oauth2.googleapis.com/token'));
        if ($email === '' || $privateKey === '' || $tokenUri === '') {
            throw new RuntimeException('Google IAP service account credentials are invalid.');
        }

        return [
            'client_email' => $email,
            'private_key' => $privateKey,
            'token_uri' => $tokenUri,
        ];
    }

    private function encodeJwt(array $header, array $claims, string $privateKey): string
    {
        $unsigned = $this->base64Url(json_encode($header, JSON_THROW_ON_ERROR))
            .'.'.$this->base64Url(json_encode($claims, JSON_THROW_ON_ERROR));
        $key = openssl_pkey_get_private($privateKey);
        if ($key === false || ! openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Google IAP service account private key is invalid.');
        }

        return $unsigned.'.'.$this->base64Url($signature);
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
