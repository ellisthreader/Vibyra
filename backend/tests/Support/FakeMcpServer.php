<?php

namespace Tests\Support;

use App\Services\Mcp\EndpointPolicy;
use Illuminate\Support\Facades\Http;

/**
 * A scripted remote MCP server (Streamable HTTP) plus its OAuth metadata, over
 * Http::fake, and a fixed DNS table so SSRF checks run without the network.
 * Everything here is simulated; none of it is live MCP evidence.
 */
trait FakeMcpServer
{
    protected array $dns = ['mcp.example.com' => ['93.184.216.34'], 'auth.example.com' => ['93.184.216.35'],
        'evil.example.com' => ['10.0.0.5'], 'metadata.example.com' => ['169.254.169.254'], 'v6.example.com' => ['::1']];
    protected array $mcpTools = [];
    protected bool $mcpAuth = false;
    protected bool $mcpSse = false;
    protected string $mcpVersion = '2025-06-18';
    protected array $mcpCalls = [];
    protected array $extraRoutes = [];

    protected function bootMcp(): void
    {
        config(['agents_v2_mcp.enabled' => true, 'app.url' => 'https://vibyra.test']);
        $this->app->instance(EndpointPolicy::class, new EndpointPolicy(fn (string $host) => $this->dns[$host] ?? []));
        $this->mcpTools = [
            ['name' => 'search_docs', 'description' => 'Search the docs.', 'inputSchema' => ['type' => 'object',
                'properties' => ['query' => ['type' => 'string']], 'required' => ['query']], 'annotations' => ['readOnlyHint' => true]],
            ['name' => 'create-note', 'description' => 'Create a note.', 'inputSchema' => ['type' => 'object',
                'properties' => ['text' => ['type' => 'string']], 'required' => ['text']]],
        ];
        Http::fake(function ($request) {
            foreach (array_reverse($this->extraRoutes) as [$pattern, $response])
                if (preg_match($pattern, $request->url())) return is_callable($response) ? $response($request) : $response;
            if (str_starts_with($request->url(), 'https://mcp.example.com/mcp')) return $this->mcpAnswer($request);
            return Http::response('not found', 404);
        });
    }

    protected function on(string $pattern, mixed $response): void
    {
        $this->extraRoutes[] = [$pattern, $response];
    }

    /** Protected resource + authorization server metadata, DCR and a token endpoint. */
    protected function withOAuth(): void
    {
        $this->mcpAuth = true;
        $this->on('#^https://mcp\.example\.com/\.well-known/oauth-protected-resource#', Http::response(['resource' => 'https://mcp.example.com/mcp',
            'authorization_servers' => ['https://auth.example.com'], 'scopes_supported' => ['notes']]));
        $this->on('#^https://auth\.example\.com/\.well-known/oauth-authorization-server$#', Http::response(['issuer' => 'https://auth.example.com',
            'authorization_endpoint' => 'https://auth.example.com/authorize', 'token_endpoint' => 'https://auth.example.com/token',
            'registration_endpoint' => 'https://auth.example.com/register', 'code_challenge_methods_supported' => ['S256']]));
        $this->on('#^https://auth\.example\.com/register$#', Http::response(['client_id' => 'dcr-client'], 201));
        $this->on('#^https://auth\.example\.com/token$#', Http::response(['access_token' => 'at-1', 'token_type' => 'Bearer',
            'refresh_token' => 'rt-1', 'expires_in' => 3600, 'scope' => 'notes']));
    }

    private function mcpAnswer($request)
    {
        if ($request->method() === 'DELETE') return Http::response('', 200);
        if ($this->mcpAuth && ($request->header('Authorization')[0] ?? '') !== 'Bearer at-1')
            return Http::response('', 401, ['WWW-Authenticate' => 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp", scope="notes"']);
        $body = json_decode($request->body(), true);
        $method = $body['method'] ?? '';
        $this->mcpCalls[] = [$method, $request->header('MCP-Protocol-Version')[0] ?? null, $request->header('Mcp-Session-Id')[0] ?? null];
        if (!isset($body['id'])) return Http::response('', 202);
        $result = match ($method) {
            'initialize' => ['protocolVersion' => $this->mcpVersion, 'capabilities' => ['tools' => (object) []],
                'serverInfo' => ['name' => 'Docs', 'version' => '1']],
            'tools/list' => ['tools' => $this->mcpTools],
            'tools/call' => ['content' => [['type' => 'text', 'text' => 'Called '.$body['params']['name'].' with '
                .json_encode($body['params']['arguments'])]]],
            default => null,
        };
        $message = $result === null ? ['jsonrpc' => '2.0', 'id' => $body['id'], 'error' => ['code' => -32601, 'message' => 'no']]
            : ['jsonrpc' => '2.0', 'id' => $body['id'], 'result' => $result];
        if ($this->mcpSse && $method === 'tools/call')
            return Http::response("event: message\ndata: ".json_encode(['jsonrpc' => '2.0', 'method' => 'notifications/progress'])
                ."\n\nevent: message\ndata: ".json_encode($message)."\n\n", 200, ['Content-Type' => 'text/event-stream']);
        return Http::response($message, 200, ['Content-Type' => 'application/json', 'Mcp-Session-Id' => 'sess-1']);
    }
}
