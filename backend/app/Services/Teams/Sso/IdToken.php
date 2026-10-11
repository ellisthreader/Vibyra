<?php

namespace App\Services\Teams\Sso;

use App\Models\OrganizationSso;

/**
 * Strict ID token checks (OIDC Core 3.1.3.7): RS256 only (never `none`, never HMAC with a public key), signature by a key from the
 * issuer's own JWKS, `iss` equal to the configured issuer, `aud` containing our client id (and `azp` equal to it when several
 * audiences), not expired, not issued in the future, `nonce` equal to this flow's, a subject, and an email whose domain is the
 * organization's verified domain. Any failure is a SsoException with a fixed code; nothing is partially trusted.
 */
final class IdToken
{
    public function __construct(private readonly Jwks $jwks) {}

    /** @return array{subject:string,email:string,name:?string} */
    public function verify(string $jwt, OrganizationSso $cfg, array $meta, string $nonce): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3 || strlen($jwt) > 16_384) throw new SsoException('sso_token', 'The ID token is malformed.');
        $header = json_decode(Jwks::b64($parts[0]), true);
        $claims = json_decode(Jwks::b64($parts[1]), true);
        $signature = Jwks::b64($parts[2]);
        if (!is_array($header) || !is_array($claims) || $signature === '') throw new SsoException('sso_token', 'The ID token is malformed.');
        if (($header['alg'] ?? null) !== 'RS256' || !is_string($header['kid'] ?? null) || $header['kid'] === '') throw new SsoException('sso_token', 'The ID token uses an unsupported signature.');
        $ok = openssl_verify($parts[0].'.'.$parts[1], $signature, $this->jwks->pem($meta['jwks_uri'], $header['kid']), OPENSSL_ALGO_SHA256);
        if ($ok !== 1) throw new SsoException('sso_token', 'The ID token signature is invalid.');
        $this->claims($claims, $cfg, $nonce);
        return ['subject' => (string) $claims['sub'], 'email' => strtolower(trim((string) $claims['email'])),
            'name' => is_string($claims['name'] ?? null) && trim($claims['name']) !== '' ? mb_substr(trim($claims['name']), 0, 120) : null];
    }

    private function claims(array $c, OrganizationSso $cfg, string $nonce): void
    {
        $skew = (int) config('teams.sso_clock_skew');
        $now = time();
        $aud = is_array($c['aud'] ?? null) ? $c['aud'] : [$c['aud'] ?? null];
        $exp = filter_var($c['exp'] ?? null, FILTER_VALIDATE_INT);
        $iat = filter_var($c['iat'] ?? null, FILTER_VALIDATE_INT);
        $nbf = filter_var($c['nbf'] ?? null, FILTER_VALIDATE_INT);
        $fail = fn (string $why) => throw new SsoException('sso_claims', $why);
        if (!is_string($c['iss'] ?? null) || !hash_equals($cfg->issuer, $c['iss'])) $fail('issuer');
        if (!in_array($cfg->client_id, $aud, true)) $fail('audience');
        if (count($aud) > 1 && ($c['azp'] ?? null) !== $cfg->client_id) $fail('authorized party');
        if (isset($c['azp']) && $c['azp'] !== $cfg->client_id) $fail('authorized party');
        if ($exp === false || $exp + $skew <= $now) $fail('expired');
        if ($iat === false || $iat > $now + $skew) $fail('issued in the future');
        if ($nbf !== false && $nbf > $now + $skew) $fail('not yet valid');
        if (!is_string($c['nonce'] ?? null) || $nonce === '' || !hash_equals($nonce, $c['nonce'])) $fail('nonce');
        if (!is_string($c['sub'] ?? null) || $c['sub'] === '' || strlen($c['sub']) > 255) $fail('subject');
        if (!is_string($c['email'] ?? null) || !filter_var($c['email'], FILTER_VALIDATE_EMAIL)) $fail('email');
        if (($c['email_verified'] ?? true) === false || ($c['email_verified'] ?? true) === 'false') $fail('unverified email');
        $domain = Domains::domainOf($c['email']);
        if ($cfg->verified_domain === null || $domain === null || !hash_equals($cfg->verified_domain, $domain)) throw new SsoException('sso_domain', 'email domain');
    }
}
