<?php

/*
 * Roadmap Part 11: platform and developer API. Every piece is off until its own switch is on, so
 * nothing here changes behaviour on a server that has not opted in. Contract: docs/agent-v2-api-contract.md §14.
 */
return [
    // Append-only account activity (sign-ins, trusted devices, key/webhook/MCP/grant/cap changes), read-only list.
    'activity' => (bool) env('PLATFORM_ACTIVITY_ENABLED', false),
    // Personal API keys (portal-created, hashed at rest) and the key-authenticated /api/platform/v1 routes.
    'api_keys' => (bool) env('PLATFORM_API_KEYS_ENABLED', false),
    // The generic `api.invoke` trigger kind (POST api/agents/v2/hooks/api/{trigger}).
    'api_trigger' => (bool) env('PLATFORM_API_TRIGGER_ENABLED', false),
    // Outbound, HMAC-signed run webhooks.
    'webhooks' => (bool) env('PLATFORM_WEBHOOKS_ENABLED', false),
    // Vibyra as a remote MCP server (needs api_keys too).
    'mcp_server' => (bool) env('PLATFORM_MCP_SERVER_ENABLED', false),

    'max_keys' => 10,
    'default_rate_per_minute' => 60,
    'max_rate_per_minute' => 600,
    'key_touch_seconds' => 60,
    'max_webhooks' => 5,
    // Delivery: attempts, then base seconds for 2^n backoff (30s, 60s, 2m, 4m, 8m), then the endpoint
    // pauses itself after this many deliveries in a row ended failed.
    'webhook_attempts' => 6,
    'webhook_backoff_seconds' => 30,
    'webhook_pause_after' => 5,
    'webhook_timestamp_tolerance' => 300,
];
