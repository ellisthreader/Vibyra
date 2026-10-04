<?php

namespace App\Services\Platform\Mcp;

use App\Models\ApiKey;
use App\Models\User;

/**
 * Vibyra as a remote MCP server: JSON-RPC 2.0 over Streamable HTTP (one POST, one JSON answer, no SSE, no session). It answers the
 * older handshake (`initialize` then `notifications/initialized`) and the stateless style where every request stands alone and
 * may open with `server/discover`: nothing is remembered between requests, and no `Mcp-Session-Id` is ever issued.
 */
final class Server
{
    public const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
    private const INFO = ['name' => 'Vibyra', 'title' => 'Vibyra', 'version' => '1.0.0'];
    private const INSTRUCTIONS = 'Read and start Vibyra runs for this account. Approvals are never available here.';

    public function __construct(private readonly ServerTools $tools) {}

    /** @return ?array the JSON-RPC response, or null for a notification (HTTP 202, no body) */
    public function handle(User $user, ApiKey $key, array $message, bool $modern = false): ?array
    {
        $id = $message['id'] ?? null;
        $method = $message['method'] ?? null;
        $params = is_array($message['params'] ?? null) ? $message['params'] : [];
        if (($message['jsonrpc'] ?? null) !== '2.0' || !is_string($method)) return $this->error($id, -32600, 'Invalid request.');
        if (!array_key_exists('id', $message)) return null; // a notification (initialized, cancelled, ...): nothing to answer
        if (!is_int($id) && !is_string($id)) return $this->error(null, -32600, 'A string or integer request id is required.');
        if ($modern && in_array($method, ['initialize', 'ping'], true)) return $this->error($id, -32601, 'Method not found.');
        $reply = match ($method) {
            'initialize' => $this->ok($id, [...$this->discover($params['protocolVersion'] ?? null), 'instructions' => self::INSTRUCTIONS]),
            'server/discover' => $this->ok($id, ['supportedVersions' => self::VERSIONS, 'capabilities' => ['tools' => new \stdClass]]),
            'ping' => $this->ok($id, new \stdClass),
            'tools/list' => $this->ok($id, ['tools' => $this->tools->listFor($key)]),
            'tools/call' => is_string($params['name'] ?? null)
                ? $this->ok($id, $this->tools->call($user, $key, $params['name'], is_array($params['arguments'] ?? null) ? $params['arguments'] : []))
                : $this->error($id, -32602, 'A tool name is required.'),
            default => $this->error($id, -32601, 'Method not found.'),
        };
        if ($modern && isset($reply['result'])) {
            $reply['result'] = (array) $reply['result'];
            $reply['result']['resultType'] = 'complete';
            $reply['result']['_meta']['io.modelcontextprotocol/serverInfo'] = self::INFO;
            if (in_array($method, ['server/discover', 'tools/list'], true)) {
                $reply['result']['ttlMs'] = 0;
                $reply['result']['cacheScope'] = 'private'; // tool catalogues depend on the API key's scopes
            }
        }
        return $reply;
    }

    public static function supports(string $version): bool
    {
        return in_array($version, self::VERSIONS, true);
    }

    private function discover(mixed $requested): array
    {
        return ['protocolVersion' => is_string($requested) && in_array($requested, array_slice(self::VERSIONS, 1), true) ? $requested : self::VERSIONS[1],
            'capabilities' => ['tools' => ['listChanged' => false]], 'serverInfo' => self::INFO];
    }

    public function error(mixed $id, int $code, string $message): array
    {
        return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $message]];
    }

    private function ok(mixed $id, array|object $result): array
    {
        return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
    }
}
