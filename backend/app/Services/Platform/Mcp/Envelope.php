<?php

namespace App\Services\Platform\Mcp;

use Illuminate\Http\Request;

/** Select the wire era per request; never downgrade a malformed modern claim. */
final class Envelope
{
    public const VERSION = 'io.modelcontextprotocol/protocolVersion';
    public const CAPS = 'io.modelcontextprotocol/clientCapabilities';

    /** @return array{version: string, modern: bool, error: ?array} */
    public static function read(Request $request, array $message, Server $server): array
    {
        $params = is_array($message['params'] ?? null) ? $message['params'] : [];
        $meta = $params['_meta'] ?? [];
        $metaFields = is_array($meta) ? $meta : [];
        $header = $request->header('MCP-Protocol-Version');
        $modern = $header === Server::VERSIONS[0] || (is_array($meta) && array_key_exists(self::VERSION, $meta));
        $version = $modern ? ($metaFields[self::VERSION] ?? null) : ($header ?? $params['protocolVersion'] ?? Server::VERSIONS[1]);
        $id = $message['id'] ?? null;
        $fail = fn (int $code, string $text) => ['version' => Server::VERSIONS[0], 'modern' => true, 'error' => $server->error($id, $code, $text)];
        if ($modern) {
            if (!is_array($meta) || !is_string($version) || !is_array($meta[self::CAPS] ?? null)
                || ($meta[self::CAPS] !== [] && array_is_list($meta[self::CAPS])))
                return $fail(-32602, 'Modern requests require protocolVersion and clientCapabilities metadata.');
            if ($version !== Server::VERSIONS[0]) {
                $error = $fail(-32022, 'Unsupported protocol version.');
                $error['error']['error']['data'] = ['supported' => [Server::VERSIONS[0]]];
                return $error;
            }
            if (($header !== null && $header !== $version)
                || ($request->hasHeader('MCP-Method') && $request->header('MCP-Method') !== ($message['method'] ?? null))
                || ($request->hasHeader('MCP-Param-Name') && $request->header('MCP-Param-Name') !== ($params['name'] ?? null)))
                return $fail(-32020, 'MCP headers do not match the request body.');
        } elseif ($header !== null && !Server::supports($header)) {
            return $fail(-32600, 'Unsupported protocol version.');
        }
        return ['version' => is_string($version) && Server::supports($version) ? $version : Server::VERSIONS[1], 'modern' => $modern, 'error' => null];
    }
}
