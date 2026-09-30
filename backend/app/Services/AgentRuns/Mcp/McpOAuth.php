<?php

namespace App\Services\AgentRuns\Mcp;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\McpServer;
use App\Services\ChatConnectors\OAuthFlows;

/**
 * Signing in to a remote MCP server with its own OAuth. Discovery finds the
 * authorization server; the client is a Client ID Metadata Document when the
 * server supports it, otherwise Dynamic Client Registration (public client, no
 * secret requested). The authorization request carries PKCE S256, a single-use
 * state and the resource indicator. Flows share `OAuthFlows` with connectors, so
 * `GET /connections/flows/{flow}` reports the outcome.
 */
final class McpOAuth
{
    public function __construct(private readonly Discovery $discovery, private readonly SafeHttp $http,
        private readonly OAuthFlows $flows, private readonly McpTokens $tokens) {}

    public static function redirectUri(): string
    {
        return rtrim((string) config('app.url'), '/').'/api/agents/v2/mcp/callback';
    }

    public static function metadataUrl(): string
    {
        return rtrim((string) config('app.url'), '/').'/api/agents/v2/mcp/client-metadata.json';
    }

    /** The published client metadata document (for servers that accept a URL as client_id). */
    public static function metadata(): array
    {
        return ['client_id' => self::metadataUrl(), 'client_name' => 'Vibyra Agents', 'client_uri' => rtrim((string) config('app.url'), '/'),
            'redirect_uris' => [self::redirectUri()], 'grant_types' => ['authorization_code', 'refresh_token'],
            'response_types' => ['code'], 'token_endpoint_auth_method' => 'none'];
    }

    /** @return array{flowId: string, url: string} */
    public function start(int $userId, McpServer $server, string $challenge, ?string $returnUrl): array
    {
        $found = $this->discovery->discover($server->url, $challenge);
        $previous = is_array($server->oauth) ? $server->oauth : [];
        $client = ($previous['issuer'] ?? null) === $found['issuer'] && !empty($previous['client_id'])
            ? array_intersect_key($previous, array_flip(['client_id', 'client_secret'])) : $this->register($found);
        $server->forceFill(['oauth' => [...$found, ...$client], 'auth' => 'oauth'])->save();
        $flow = $this->flows->begin($userId, $returnUrl, ['kind' => 'mcp', 'server' => $server->id, 'slug' => $server->slug]);
        $query = array_filter(['response_type' => 'code', 'client_id' => $client['client_id'], 'redirect_uri' => self::redirectUri(),
            'state' => $flow['state'], 'code_challenge' => OAuthFlows::challenge($flow['verifier']), 'code_challenge_method' => 'S256',
            'resource' => $found['resource'], 'scope' => $found['scope']], fn ($v) => $v !== '' && $v !== null);
        return ['flowId' => $flow['flowId'], 'url' => $this->flows->entry($flow,
            $found['authorize'].(str_contains($found['authorize'], '?') ? '&' : '?').http_build_query($query), '/api/agents/v2/mcp/callback',
            $this->serverLabel($server))];
    }

    /** The server's name is whatever the person typed, so the page also shows its host: the name alone could pose as a known service. */
    private function serverLabel(McpServer $server): string
    {
        $host = (string) parse_url((string) $server->url, PHP_URL_HOST);
        $name = trim((string) $server->name);
        $label = $name !== '' ? $name : $host;
        if ($label === '') return 'a remote MCP server';
        return $host !== '' && $label !== $host ? $label.' ('.$host.')' : $label;
    }

    /** The browser is back from the server's sign-in. Returns the flow, or null for an unknown/replayed state. */
    public function finish(string $state, string $code, string $error, string $binding = ''): ?array
    {
        $flow = $this->flows->claim($state, $binding);
        if (!$flow || ($flow['kind'] ?? '') !== 'mcp') return null;
        $server = McpServer::query()->whereKey($flow['server'] ?? '')->where('user_id', (int) $flow['userId'])->first();
        $row = $server ? Connection::query()->whereKey($server->connection_id)->whereNull('revoked_at')->first() : null;
        if (!$server || !$row || !is_array($server->oauth) || $error !== '' || $code === '') {
            $this->flows->fail($flow, $error === 'access_denied' ? 'You cancelled the sign-in.' : 'The sign-in did not finish. Please try again.');
            return $flow;
        }
        try {
            $grant = $this->tokens->exchange($server->oauth, $code, (string) $flow['verifier'], self::redirectUri());
            $this->tokens->store($row, $grant, true);
            app(McpServers::class)->sync($server->fresh(), $row->fresh());
        } catch (McpError $e) {
            $this->flows->fail($flow, 'The server did not finish the sign-in: '.$e->getMessage());
            return $flow;
        }
        $this->flows->succeed($flow, ['connectionId' => $row->id]);
        return $flow;
    }

    private function register(array $found): array
    {
        if ($found['cimd']) return ['client_id' => self::metadataUrl()];
        if (!$found['register']) throw new McpError('oauth_error', 'This MCP server does not let new apps register, so Vibyra cannot sign in to it.');
        $response = $this->http->send('POST', $found['register'], ['headers' => ['Accept' => 'application/json'],
            'json' => array_diff_key(self::metadata(), ['client_id' => true, 'client_uri' => true])
                + ($found['scope'] !== '' ? ['scope' => $found['scope']] : [])]);
        $id = $response->json('client_id');
        if (!$response->successful() || !is_string($id) || $id === '' || strlen($id) > 500)
            throw new McpError('oauth_error', 'This MCP server refused to register Vibyra as an app.');
        $secret = $response->json('client_secret');
        return ['client_id' => $id, 'client_secret' => is_string($secret) ? $secret : null];
    }
}
