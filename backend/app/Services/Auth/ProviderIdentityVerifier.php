<?php

namespace App\Services\Auth;

class ProviderIdentityVerifier
{
    public function __construct(private readonly JwksTokenVerifier $tokens)
    {
    }

    public function verify(string $provider, string $token, ?string $nonce = null): array
    {
        $settings = $this->settings($provider);
        if ($token === '' || $settings['audiences'] === []) {
            throw new ProviderIdentityException('The identity provider is not configured.');
        }

        $claims = $this->tokens->verify($token, $settings['jwks']);
        $this->assertStandardClaims($claims, $settings);
        if ($nonce !== null && $nonce !== '') {
            $claimNonce = (string) ($claims['nonce'] ?? '');
            if ($claimNonce === '' || ! hash_equals($nonce, $claimNonce)) {
                throw new ProviderIdentityException('The identity token nonce is invalid.');
            }
        }

        $email = $this->verifiedEmail($claims);
        if ($provider === 'google' && $email === null) {
            throw new ProviderIdentityException('Google did not return a verified email address.');
        }

        return [
            'provider' => $provider,
            'subject' => (string) $claims['sub'],
            'email' => $email,
            'name' => $this->claimString($claims, 'name'),
        ];
    }

    private function settings(string $provider): array
    {
        return match ($provider) {
            'apple' => [
                'issuer' => ['https://appleid.apple.com'],
                'audiences' => $this->configuredAudiences('services.apple_auth.audiences'),
                'jwks' => (string) config('services.apple_auth.jwks_url'),
            ],
            'google' => [
                'issuer' => ['https://accounts.google.com', 'accounts.google.com'],
                'audiences' => $this->configuredAudiences('services.google_auth.audiences'),
                'jwks' => (string) config('services.google_auth.jwks_url'),
            ],
            default => throw new ProviderIdentityException('Unsupported login provider.'),
        };
    }

    private function assertStandardClaims(array $claims, array $settings): void
    {
        $issuer = (string) ($claims['iss'] ?? '');
        $subject = (string) ($claims['sub'] ?? '');
        $expiresAt = filter_var($claims['exp'] ?? null, FILTER_VALIDATE_INT);
        $issuedAt = filter_var($claims['iat'] ?? null, FILTER_VALIDATE_INT);
        $notBefore = filter_var($claims['nbf'] ?? null, FILTER_VALIDATE_INT);
        $audiences = is_array($claims['aud'] ?? null) ? $claims['aud'] : [$claims['aud'] ?? null];
        $authorizedParty = trim((string) ($claims['azp'] ?? ''));

        if (! in_array($issuer, $settings['issuer'], true)
            || $subject === ''
            || $expiresAt === false
            || $expiresAt <= time()
            || $issuedAt === false
            || $issuedAt > time() + 60
            || ($notBefore !== false && $notBefore > time() + 60)
            || ($authorizedParty !== '' && ! in_array($authorizedParty, $settings['audiences'], true))
            || array_intersect($settings['audiences'], $audiences) === []) {
            throw new ProviderIdentityException('The identity token claims are invalid.');
        }
    }

    private function verifiedEmail(array $claims): ?string
    {
        $email = filter_var(strtolower(trim((string) ($claims['email'] ?? ''))), FILTER_VALIDATE_EMAIL);
        $verified = filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOL);

        return $email && $verified ? $email : null;
    }

    private function configuredAudiences(string $key): array
    {
        return array_values(array_filter(array_map(
            fn ($value) => trim((string) $value),
            (array) config($key, [])
        )));
    }

    private function claimString(array $claims, string $key): ?string
    {
        $value = trim((string) ($claims[$key] ?? ''));

        return $value === '' ? null : $value;
    }
}
