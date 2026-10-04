<?php

/*
 * Agent V2 local (stdio) MCP servers (roadmap Part 6). A person runs an MCP server on their own Mac; the Mac
 * keeps its command line and environment and tells the backend only an opaque connection id, a display name
 * and the tool catalogue. Teammates reach it through the leased Mac exactly like computer and browser tools
 * (claim, execute, receipt). Off by default. The remote-MCP settings in agents_v2_mcp.php (tool cap, schema
 * rules) apply to the catalogue too.
 */
return [
    'enabled' => (bool) env('AGENTS_V2_LOCAL_MCP_ENABLED', false),
    'max_servers' => 10,
    // A catalogue the Mac registers or re-posts at claim time (names, descriptions, schemas).
    'max_catalogue_bytes' => 512 * 1024,
    // Largest body of one Mac receipt; the result text itself is held to max_text_bytes.
    'max_receipt_bytes' => 64 * 1024,
    'max_text_bytes' => 16000,
];
