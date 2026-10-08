<?php

namespace Tests\Support;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * A local mock OpenID Connect provider for the Teams SSO tests (roadmap Part 13). There is no real identity provider available, so
 * this stands in for one: discovery, JWKS, an authorization step that checks `client_id`, `redirect_uri`, `state`, `nonce` and the
 * PKCE challenge, and a token endpoint that checks the code (single use), the PKCE verifier, the redirect URI and the client secret
 * (post or basic) and then signs an RS256 ID token. Each knob below breaks exactly one thing so every validation can be exercised.
 * It answers through Http::fake, which is the same HTTP client the application uses, so nothing about the application is mocked.
 */
final class MockOidcProvider
{
    public string $issuer = 'https://idp.example.test';
    public string $clientId = 'vibyra-client';
    public string $secret = 'idp-client-secret';
    public string $kid = 'key-1';
    public string $authMethod = 'client_secret_post';
    public array $claims = [];          // overrides merged into the ID token claims
    public array $discovery = [];       // overrides merged into the discovery document
    public bool $signWithOtherKey = false;
    public ?string $headerKid = null;  // the kid the token claims, when it should differ from the published key
    public ?string $alg = null;         // override the header alg (e.g. HS256, none)
    public array $log = [];             // [path => count]
    private $key;
    private $other;
    private array $codes = [];

    public function __construct()
    {
        $opts = TestCase::openSslOptions(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $this->key = openssl_pkey_new($opts);
        $this->other = openssl_pkey_new($opts);
    }

    public function install(): void
    {
        Http::fake([parse_url($this->issuer, PHP_URL_HOST).'/*' => fn (Request $r) => $this->handle($r)]);
    }

    /** The browser's step at the provider: returns the redirect back to the application, or null when the provider would refuse. */
    public function authorize(string $authUrl, string $email, string $sub = 'idp-user-1', string $name = 'Ada Lovelace'): ?string
    {
        parse_str((string) parse_url($authUrl, PHP_URL_QUERY), $q);
        if (($q['client_id'] ?? '') !== $this->clientId || ($q['response_type'] ?? '') !== 'code' || ($q['code_challenge_method'] ?? '') !== 'S256'
            || empty($q['code_challenge']) || empty($q['state']) || empty($q['nonce']) || empty($q['redirect_uri'])) return null;
        $code = bin2hex(random_bytes(16));
        $this->codes[$code] = ['challenge' => $q['code_challenge'], 'nonce' => $q['nonce'], 'redirect' => $q['redirect_uri'], 'email' => $email, 'sub' => $sub, 'name' => $name, 'used' => false];
        return $q['redirect_uri'].'?'.http_build_query(['code' => $code, 'state' => $q['state']]);
    }

    public function jwt(array $claims, ?string $alg = null): string
    {
        $header = ['alg' => $alg ?? $this->alg ?? 'RS256', 'typ' => 'JWT', 'kid' => $this->headerKid ?? $this->kid];
        $input = $this->b64(json_encode($header)).'.'.$this->b64(json_encode($claims));
        if (($header['alg']) === 'none') return $input.'.';
        if ($header['alg'] === 'HS256') return $input.'.'.$this->b64(hash_hmac('sha256', $input, $this->publicPem(), true));
        openssl_sign($input, $sig, $this->signWithOtherKey ? $this->other : $this->key, OPENSSL_ALGO_SHA256);
        return $input.'.'.$this->b64($sig);
    }

    public function publicPem(): string
    {
        return openssl_pkey_get_details($this->key)['key'];
    }

    private function handle(Request $r)
    {
        $path = parse_url($r->url(), PHP_URL_PATH);
        $this->log[$path] = ($this->log[$path] ?? 0) + 1;
        return match ($path) {
            '/.well-known/openid-configuration' => Http::response(array_merge($this->metadata(), $this->discovery)),
            '/jwks' => Http::response(['keys' => [$this->jwk()]]),
            '/token' => $this->token($r),
            default => Http::response('', 404),
        };
    }

    private function metadata(): array
    {
        return ['issuer' => $this->issuer, 'authorization_endpoint' => $this->issuer.'/authorize', 'token_endpoint' => $this->issuer.'/token',
            'jwks_uri' => $this->issuer.'/jwks', 'response_types_supported' => ['code'], 'code_challenge_methods_supported' => ['S256', 'plain'],
            'id_token_signing_alg_values_supported' => ['RS256'], 'token_endpoint_auth_methods_supported' => [$this->authMethod]];
    }

    private function token(Request $r)
    {
        $f = $r->data();
        $id = $f['client_id'] ?? null;
        $secret = $f['client_secret'] ?? null;
        if ($this->authMethod === 'client_secret_basic') {
            [$id, $secret] = array_map('rawurldecode', explode(':', base64_decode(substr($r->header('Authorization')[0] ?? '', 6)) . ':', 3));
        }
        $code = $this->codes[$f['code'] ?? ''] ?? null;
        $verifierOk = $code && isset($f['code_verifier']) && hash_equals($code['challenge'], rtrim(strtr(base64_encode(hash('sha256', $f['code_verifier'], true)), '+/', '-_'), '='));
        if (($f['grant_type'] ?? '') !== 'authorization_code' || $id !== $this->clientId || $secret !== $this->secret || !$code || $code['used']
            || !$verifierOk || ($f['redirect_uri'] ?? '') !== $code['redirect']) return Http::response(['error' => 'invalid_grant'], 400);
        $this->codes[$f['code']]['used'] = true;
        $now = time();
        $claims = array_merge(['iss' => $this->issuer, 'aud' => $this->clientId, 'sub' => $code['sub'], 'email' => $code['email'], 'email_verified' => true,
            'name' => $code['name'], 'iat' => $now, 'exp' => $now + 600, 'nonce' => $code['nonce']], $this->claims);
        return Http::response(['access_token' => 'unused', 'token_type' => 'Bearer', 'id_token' => $this->jwt(array_filter($claims, fn ($v) => $v !== '__omit__'))]);
    }

    private function jwk(): array
    {
        $d = openssl_pkey_get_details($this->key)['rsa'];
        return ['kty' => 'RSA', 'kid' => $this->kid, 'use' => 'sig', 'alg' => 'RS256', 'n' => $this->b64($d['n']), 'e' => $this->b64($d['e'])];
    }

    private function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }
}
