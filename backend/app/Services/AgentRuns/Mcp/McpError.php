<?php

namespace App\Services\AgentRuns\Mcp;

use RuntimeException;

/**
 * A remote MCP failure with a machine reason: `blocked_destination` (SSRF policy),
 * `redirect_blocked`, `too_large`, `unreachable` (transport/timeout),
 * `unauthorized` (401; carries the WWW-Authenticate header for discovery),
 * `insufficient_scope`, `unsupported_protocol`, `protocol_error`, `rpc_error`,
 * `server_error`, `session_expired`, `oauth_error`.
 */
final class McpError extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message, public readonly ?string $challenge = null)
    {
        parent::__construct($message);
    }
}
