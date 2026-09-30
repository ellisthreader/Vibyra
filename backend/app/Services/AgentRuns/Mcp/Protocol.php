<?php

namespace App\Services\AgentRuns\Mcp;

use Illuminate\Http\Client\Response;

/**
 * MCP over Streamable HTTP, client side and stateless per operation: `open` sends
 * `initialize` with the newest protocol version we speak, accepts the server's
 * answer only if it is a version we support, keeps its `Mcp-Session-Id`, and sends
 * `notifications/initialized`. Later requests carry the session id and the
 * negotiated `MCP-Protocol-Version`. A response may be JSON or an SSE stream; the
 * JSON-RPC answer with our request id is taken from either.
 */
final class Protocol
{
    public function __construct(private readonly SafeHttp $http) {}

    /** @return array{url: string, token: ?string, id: ?string, version: string, server: array} */
    public function open(string $url, ?string $token): array
    {
        $versions = (array) config('agents_v2_mcp.protocol_versions');
        $session = ['url' => $url, 'token' => $token, 'id' => null, 'version' => null, 'server' => []];
        [$result, $response] = $this->exchange($session, 'initialize', ['protocolVersion' => $versions[0], 'capabilities' => (object) [],
            'clientInfo' => ['name' => 'Vibyra Agents', 'version' => '1.0.0']]);
        $version = $result['protocolVersion'] ?? null;
        if (!is_string($version) || !in_array($version, $versions, true))
            throw new McpError('unsupported_protocol', 'This MCP server speaks a protocol version Vibyra does not support ('
                .mb_substr((string) (is_string($version) ? $version : 'none'), 0, 20).').');
        $id = $response->header('Mcp-Session-Id');
        $session = [...$session, 'id' => $id !== '' && preg_match('/^[\x21-\x7E]{1,200}$/D', $id) ? $id : null, 'version' => $version,
            'server' => ['name' => mb_substr((string) ($result['serverInfo']['name'] ?? ''), 0, 80),
                'tools' => is_array($result['capabilities']['tools'] ?? null)]];
        $ack = $this->post($session, ['jsonrpc' => '2.0', 'method' => 'notifications/initialized']);
        if (!$ack->successful()) throw new McpError('protocol_error', 'The MCP server refused the session start.');
        return $session;
    }

    public function request(array $session, string $method, array $params = []): array
    {
        return $this->exchange($session, $method, $params)[0];
    }

    /** Ends the server-side session; failures are irrelevant because we never reuse it. */
    public function close(array $session): void
    {
        if (!$session['id']) return;
        try { $this->http->send('DELETE', $session['url'], ['headers' => $this->headers($session)]); } catch (\Throwable) {}
    }

    /** @return array{0: array, 1: Response} */
    private function exchange(array $session, string $method, array $params): array
    {
        $id = random_int(1, 2_000_000_000);
        $response = $this->post($session, ['jsonrpc' => '2.0', 'id' => $id, 'method' => $method, 'params' => (object) $params]);
        $status = $response->status();
        if ($status === 401) throw new McpError('unauthorized', 'The MCP server needs you to sign in.',
            (string) $response->header('WWW-Authenticate'));
        if ($status === 403 && str_contains(strtolower((string) $response->header('WWW-Authenticate')), 'insufficient_scope'))
            throw new McpError('insufficient_scope', 'The MCP server needs wider access. Sign in to it again.',
                (string) $response->header('WWW-Authenticate'));
        if ($status === 404 && $session['id']) throw new McpError('session_expired', 'The MCP session ended. Try again.');
        if ($status >= 500) throw new McpError('server_error', 'The MCP server had a problem.');
        if (!$response->successful()) throw new McpError('protocol_error', 'The MCP server refused the request (HTTP '.$status.').');
        $message = $this->message($response, $id);
        if (is_array($message['error'] ?? null)) throw new McpError('rpc_error', 'The MCP server answered with an error: '
            .mb_substr((string) ($message['error']['message'] ?? 'unknown'), 0, 200));
        if (!is_array($message['result'] ?? null)) throw new McpError('protocol_error', 'The MCP server gave no result.');
        return [$message['result'], $response];
    }

    private function post(array $session, array $body): Response
    {
        return $this->http->send('POST', $session['url'], ['headers' => $this->headers($session), 'json' => $body]);
    }

    private function headers(array $session): array
    {
        return array_filter(['Accept' => 'application/json, text/event-stream', 'Content-Type' => 'application/json',
            'Authorization' => $session['token'] ? 'Bearer '.$session['token'] : null, 'Mcp-Session-Id' => $session['id'],
            'MCP-Protocol-Version' => $session['version']]);
    }

    /** The JSON-RPC response for `$id`, from a JSON body or an SSE stream of events. */
    private function message(Response $response, int $id): array
    {
        if (str_contains(strtolower((string) $response->header('Content-Type')), 'text/event-stream')) {
            foreach (preg_split("/\r?\n\r?\n/", $response->body()) as $event) {
                $data = implode("\n", array_map(fn ($l) => ltrim(substr($l, 5)), array_filter(preg_split("/\r?\n/", $event),
                    fn ($l) => str_starts_with($l, 'data:'))));
                $decoded = json_decode($data, true);
                if (is_array($decoded) && ($decoded['id'] ?? null) === $id) return $decoded;
            }
            throw new McpError('protocol_error', 'The MCP server stream ended without an answer.');
        }
        $decoded = $response->json();
        if (is_array($decoded) && array_is_list($decoded)) $decoded = collect($decoded)->firstWhere('id', $id);
        if (!is_array($decoded) || ($decoded['id'] ?? null) !== $id) throw new McpError('protocol_error', 'The MCP server answer was unreadable.');
        return $decoded;
    }
}
