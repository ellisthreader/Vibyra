<?php

namespace App\Services\Teams\Sso;

use App\Services\AgentRuns\Mcp\{McpError, SafeHttp};
use Illuminate\Support\Facades\Cache;

/**
 * OIDC issuer discovery, fetched through SafeHttp (public HTTPS hosts only, pinned DNS, no redirects off-site) because the issuer is
 * typed in by an organization owner. The document's own `issuer` must equal the configured one exactly (OIDC Discovery 4.3), the
 * endpoints must be HTTPS, and a provider that advertises what it supports must support the code flow, S256 PKCE and RS256.
 */
final class Discovery
{
    public function __construct(private readonly SafeHttp $http) {}

    /** @return array{issuer:string,authorization_endpoint:string,token_endpoint:string,jwks_uri:string,auth_method:string} */
    public function get(string $issuer, bool $fresh = false): array
    {
        $key = 'team-sso:discovery:'.hash('sha256', $issuer);
        if (!$fresh && is_array($hit = Cache::get($key))) return $hit;
        $meta = $this->fetch($issuer);
        Cache::put($key, $meta, now()->addMinutes(15));
        return $meta;
    }

    private function fetch(string $issuer): array
    {
        $parts = parse_url($issuer);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['query']) || isset($parts['fragment']) || isset($parts['user']) || strlen($issuer) > 300)
            throw new SsoException('sso_provider', 'The issuer must be an https address without a query or fragment.');
        try {
            $response = $this->http->send('GET', rtrim($issuer, '/').'/.well-known/openid-configuration', ['headers' => ['Accept' => 'application/json']]);
        } catch (McpError $e) {
            throw new SsoException('sso_provider', 'The identity provider could not be reached: '.$e->getMessage());
        }
        $doc = $response->successful() ? $response->json() : null;
        if (!is_array($doc)) throw new SsoException('sso_provider', 'The identity provider returned no discovery document.');
        if (($doc['issuer'] ?? null) !== $issuer) throw new SsoException('sso_provider', 'The discovery document names a different issuer.');
        foreach (['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as $field) {
            $u = parse_url((string) ($doc[$field] ?? ''));
            if (!is_array($u) || ($u['scheme'] ?? '') !== 'https' || empty($u['host']) || isset($u['user']) || isset($u['fragment']))
                throw new SsoException('sso_provider', "The discovery document has no usable $field.");
        }
        $this->requires($doc, 'response_types_supported', 'code');
        $this->requires($doc, 'code_challenge_methods_supported', 'S256');
        $this->requires($doc, 'id_token_signing_alg_values_supported', 'RS256');
        $methods = $doc['token_endpoint_auth_methods_supported'] ?? ['client_secret_basic'];
        $method = in_array('client_secret_post', (array) $methods, true) ? 'post' : (in_array('client_secret_basic', (array) $methods, true) ? 'basic' : null);
        if ($method === null) throw new SsoException('sso_provider', 'The provider needs a client authentication method Vibyra does not support.');
        return ['issuer' => $issuer, 'authorization_endpoint' => $doc['authorization_endpoint'], 'token_endpoint' => $doc['token_endpoint'],
            'jwks_uri' => $doc['jwks_uri'], 'auth_method' => $method];
    }

    private function requires(array $doc, string $field, string $value): void
    {
        if (isset($doc[$field]) && !in_array($value, (array) $doc[$field], true))
            throw new SsoException('sso_provider', "The provider does not support $value ($field).");
    }
}
