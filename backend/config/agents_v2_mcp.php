<?php

/*
 * Agent V2 remote MCP servers (rebuild Stage 3). A person adds an HTTPS MCP URL;
 * the backend (never the Mac) speaks Streamable HTTP to it, signs in with the
 * server's own OAuth (protected-resource + authorization-server discovery, PKCE,
 * resource indicator), pins the reviewed tool list by revision and brokers calls
 * under per-server grants. Every request is DNS-checked against private, loopback,
 * link-local and metadata ranges, redirects are re-checked, and answers are capped.
 */
return [
    'enabled' => (bool) env('AGENTS_V2_MCP_ENABLED', false),
    // Newest first; the server's answer to `initialize` must be one of these.
    'protocol_versions' => ['2025-11-25', '2025-06-18', '2025-03-26'],
    'max_servers' => 10,
    'max_tools' => 100,
    'max_response_bytes' => 1_000_000,
    'timeout_seconds' => 12,
    'connect_timeout_seconds' => 5,
    'max_redirects' => 3,
];
