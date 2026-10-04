<?php

/*
 * Integrations let a chat reach a service the person already uses. The catalogue
 * is a menu and is readable by anyone, the way the model catalogue is; connecting
 * an account and running an integration tool are what this flag gates.
 *
 * `credential` describes signing in on the provider website, so the
 * install page can be written from this file rather than from hardcoded copy.
 *
 * `writes` is the honest half of the pair. An integration that only reads leaves
 * it null; one that can change something in the person's account says so here, in
 * the same words the app puts under "Changes".
 */
return [

    'enabled' => env('CHAT_CONNECTORS_ENABLED', false),
    // OAuth registration and browser binding share an origin independent of the marketing domain.
    'callback_base_url' => env('CHAT_CONNECTORS_CALLBACK_BASE_URL'),
    'public_mcp_enabled' => env('CHAT_CONNECTORS_PUBLIC_MCP_ENABLED', false),
    'composio_public_enabled' => env('CHAT_CONNECTORS_COMPOSIO_PUBLIC_ENABLED', false),
    'composio_api_key' => env('CHAT_CONNECTORS_COMPOSIO_API_KEY', ''),

    // A connected account is never called more slowly than this allows, and one
    // integration call may never hold a turn open longer than the job's own timeout.
    'timeout_seconds' => (int) env('CHAT_CONNECTORS_TIMEOUT_SECONDS', 12),

    // At most this many integration tools may be attached to a single turn. Every
    // tool schema is sent with the prompt and is therefore paid for by the person.
    'max_per_turn' => 10,

    'catalogue' => [

        ...require __DIR__.'/chat_connectors/core.php',
        ...require __DIR__.'/chat_connectors/workspace.php',
        ...require __DIR__.'/chat_connectors/google_tasks.php',
        ...require __DIR__.'/chat_connectors/public_mcp.php',
        ...require __DIR__.'/chat_connectors/collaboration.php',
    ],

];
