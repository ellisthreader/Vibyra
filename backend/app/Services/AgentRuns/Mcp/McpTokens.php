<?php

namespace App\Services\AgentRuns\Mcp;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\McpServer;
use App\Services\ChatConnectors\ReconnectRequired;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Token exchange and refresh with an MCP server's own authorization server. Every
 * token request names the resource (RFC 8707) so a token is bound to this server,
 * and goes through the SSRF-safe client. The access token is decrypted only for
 * one broker call; refresh is serialized per connection.
 */
final class McpTokens
{
    private const RENEW_MARGIN_SECONDS = 120;

    public function __construct(private readonly SafeHttp $http) {}

    /** @return array{access: string, refresh: ?string, expires_in: ?int, scope: ?string} */
    public function exchange(array $oauth, string $code, string $verifier, string $redirect): array
    {
        return $this->token($oauth, ['grant_type' => 'authorization_code', 'code' => $code, 'redirect_uri' => $redirect,
            'code_verifier' => $verifier]);
    }

    /** The access token for one call, refreshed first when it is about to expire. */
    public function credential(Connection $row): string
    {
        if (!$row->credential) throw ReconnectRequired::for($row->provider);
        return DB::transaction(function () use ($row) {
            $fresh = Connection::query()->whereKey($row->id)->lockForUpdate()->firstOrFail();
            $token = Crypt::decryptString($fresh->credential);
            if (!$fresh->refresh_token || !$fresh->expires_at || $fresh->expires_at->isAfter(now()->addSeconds(self::RENEW_MARGIN_SECONDS)))
                return $token;
            $server = McpServer::query()->where('connection_id', $fresh->id)->first();
            if (!$server || !is_array($server->oauth)) return $token;
            try {
                $grant = $this->token($server->oauth, ['grant_type' => 'refresh_token',
                    'refresh_token' => Crypt::decryptString($fresh->refresh_token)]);
            } catch (McpError $e) {
                if ($e->reason === 'oauth_error') throw ReconnectRequired::for($fresh->provider);
                return $token; // Unreachable right now: the stored token fails on its own terms.
            }
            $this->store($fresh, $grant, false);
            return $grant['access'];
        });
    }

    /** Save a grant on the server's connection; a new sign-in is a new credential generation. */
    public function store(Connection $row, array $grant, bool $newSignIn): void
    {
        $row->forceFill(['credential' => Crypt::encryptString($grant['access']),
            'refresh_token' => $grant['refresh'] ? Crypt::encryptString($grant['refresh']) : ($newSignIn ? null : $row->refresh_token),
            'expires_at' => $grant['expires_in'] ? now()->addSeconds($grant['expires_in']) : null,
            'scopes' => $grant['scope'] ? array_values(array_filter(preg_split('/\s+/', $grant['scope']))) : $row->scopes,
            ...($newSignIn ? ['health' => 'healthy', 'generation' => $row->credential ? $row->generation + 1 : $row->generation] : [])])->save();
    }

    private function token(array $oauth, array $fields): array
    {
        $fields += ['client_id' => (string) $oauth['client_id'], 'resource' => (string) $oauth['resource']];
        if (!empty($oauth['client_secret'])) $fields['client_secret'] = (string) $oauth['client_secret'];
        $response = $this->http->send('POST', (string) $oauth['token'], ['headers' => ['Accept' => 'application/json'], 'form' => $fields]);
        $access = $response->json('access_token');
        if (in_array($response->status(), [400, 401], true) || ($response->successful() && !is_string($access)))
            throw new McpError('oauth_error', 'The sign-in server refused the token request.');
        if (!$response->successful() || !is_string($access) || $access === '')
            throw new McpError('unreachable', 'The sign-in server could not issue a token right now.');
        $type = strtolower((string) ($response->json('token_type') ?? 'bearer'));
        if ($type !== 'bearer') throw new McpError('oauth_error', 'The sign-in server issued an unsupported token type.');
        return ['access' => $access, 'refresh' => is_string($response->json('refresh_token')) ? $response->json('refresh_token') : null,
            'expires_in' => is_numeric($response->json('expires_in')) ? (int) $response->json('expires_in') : null,
            'scope' => is_string($response->json('scope')) ? mb_substr($response->json('scope'), 0, 1000) : null];
    }
}
