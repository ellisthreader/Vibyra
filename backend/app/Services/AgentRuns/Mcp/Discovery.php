<?php

namespace App\Services\AgentRuns\Mcp;

/**
 * OAuth discovery for a remote MCP server, per the MCP authorization spec
 * (2025-06-18 / 2025-11-25): protected resource metadata (RFC 9728) from the
 * 401's `resource_metadata` or the well-known paths, then the authorization
 * server's metadata (RFC 8414 / OIDC paths, issuer must match exactly). The
 * resource must be this server's own address, PKCE S256 must be supported, and
 * every endpoint is HTTPS and fetched through the SSRF-safe client.
 */
final class Discovery
{
    public function __construct(private readonly SafeHttp $http) {}

    /** @return array{resource: string, issuer: string, authorize: string, token: string, register: ?string, cimd: bool, scope: string} */
    public function discover(string $serverUrl, string $challenge): array
    {
        $params = self::challenge($challenge);
        $resource = self::canonical($serverUrl);
        $prm = null;
        foreach (array_filter([$params['resource_metadata'] ?? null, ...$this->wellKnown($serverUrl, 'oauth-protected-resource')]) as $url) {
            $prm = $this->json($url);
            if ($prm) break;
        }
        $as = null;
        if (!$prm) {
            // Servers written for the 2025-03-26 spec (Atlassian's) publish no resource metadata: their authorization server is their own origin.
            $origin = 'https://'.strtolower((string) parse_url($resource, PHP_URL_HOST));
            $as = $this->authorizationServer($origin, true);
            if (!$as) throw new McpError('oauth_error', 'This MCP server does not publish how to sign in to it.');
            $prm = ['resource' => $resource, 'authorization_servers' => [$origin]];
        }
        $declared = is_string($prm['resource'] ?? null) ? self::canonical($prm['resource']) : '';
        if ($declared === '' || !self::covers($declared, $resource))
            throw new McpError('oauth_error', 'This MCP server\'s sign-in metadata names a different resource.');
        $issuer = $prm['authorization_servers'][0] ?? null;
        if (!is_string($issuer) || !str_starts_with($issuer, 'https://')) throw new McpError('oauth_error', 'This MCP server names no sign-in server.');
        $as ??= $this->authorizationServer($issuer);
        $scopes = $params['scope'] ?? (is_array($prm['scopes_supported'] ?? null) ? implode(' ', array_filter($prm['scopes_supported'], 'is_string')) : '');
        return ['resource' => $declared === $resource ? $resource : $declared, 'issuer' => $issuer,
            'authorize' => $as['authorization_endpoint'], 'token' => $as['token_endpoint'],
            'register' => is_string($as['registration_endpoint'] ?? null) ? $as['registration_endpoint'] : null,
            'cimd' => ($as['client_id_metadata_document_supported'] ?? false) === true, 'scope' => mb_substr($scopes, 0, 1000)];
    }

    /** @param bool $optional return null instead of failing when the server publishes no metadata at all */
    private function authorizationServer(string $issuer, bool $optional = false): ?array
    {
        $candidates = parse_url($issuer, PHP_URL_PATH) && trim((string) parse_url($issuer, PHP_URL_PATH), '/') !== ''
            ? [...$this->wellKnown($issuer, 'oauth-authorization-server'), $this->wellKnown($issuer, 'openid-configuration')[0],
                rtrim($issuer, '/').'/.well-known/openid-configuration']
            : [$this->wellKnown($issuer, 'oauth-authorization-server')[1], $this->wellKnown($issuer, 'openid-configuration')[1]];
        foreach (array_unique($candidates) as $url) {
            $meta = $this->json($url);
            if (!$meta) continue;
            if (($meta['issuer'] ?? null) !== $issuer) throw new McpError('oauth_error', 'The sign-in server metadata does not match its issuer.');
            if (!in_array('S256', (array) ($meta['code_challenge_methods_supported'] ?? []), true))
                throw new McpError('oauth_error', 'The sign-in server does not support PKCE (S256), so Vibyra will not use it.');
            foreach (['authorization_endpoint', 'token_endpoint'] as $k)
                if (!is_string($meta[$k] ?? null) || !str_starts_with($meta[$k], 'https://'))
                    throw new McpError('oauth_error', 'The sign-in server metadata is incomplete.');
            return $meta;
        }
        if ($optional) return null;
        throw new McpError('oauth_error', 'The sign-in server does not publish its metadata.');
    }

    /** `https://host/.well-known/{name}{path}` first, then the root form. */
    private function wellKnown(string $url, string $name): array
    {
        $p = parse_url($url);
        $path = rtrim((string) ($p['path'] ?? ''), '/');
        $root = 'https://'.strtolower((string) ($p['host'] ?? '')).'/.well-known/'.$name;
        return $path !== '' ? [$root.$path, $root] : [$root, $root];
    }

    private function json(string $url): ?array
    {
        try { $response = $this->http->send('GET', $url, ['headers' => ['Accept' => 'application/json']], true); }
        catch (McpError $e) {
            if (in_array($e->reason, ['blocked_destination', 'redirect_blocked'], true)) throw $e;
            return null;
        }
        $body = $response->successful() ? $response->json() : null;
        return is_array($body) && !array_is_list($body) ? $body : null;
    }

    /** Parameters of a `Bearer ...` WWW-Authenticate challenge. */
    public static function challenge(string $header): array
    {
        preg_match_all('/([a-z_]+)="([^"]*)"/i', $header, $m, PREG_SET_ORDER);
        return collect($m)->mapWithKeys(fn ($x) => [strtolower($x[1]) => $x[2]])->all();
    }

    /** The canonical resource URI: lowercase scheme and host, no fragment, no trailing slash on a bare origin. */
    public static function canonical(string $url): string
    {
        $p = parse_url($url);
        if (!$p || strtolower((string) ($p['scheme'] ?? '')) !== 'https' || empty($p['host'])) return '';
        $path = (string) ($p['path'] ?? '');
        return 'https://'.strtolower($p['host']).($path === '/' ? '' : $path).(isset($p['query']) ? '?'.$p['query'] : '');
    }

    /** The declared resource is the server itself or a path prefix of it on the same origin. */
    private static function covers(string $declared, string $resource): bool
    {
        return $declared === $resource || str_starts_with($resource, rtrim($declared, '/').'/');
    }
}
