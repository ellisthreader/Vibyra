<?php

namespace App\Services\AgentRuns\Mcp;

/**
 * The one-tap remote MCP services (config/agents_v2_mcp_presets.php) as the catalogue shows them. A client adds one
 * by posting its `url` and `name` to `POST /api/agents/v2/mcp/servers`; there is nothing preset-specific to store.
 */
final class McpPresets
{
    /**
     * Empty unless a person could connect one right now (the same two switches `McpServers::add` checks), so a client
     * that hides the section when the list is empty never offers a service that cannot connect.
     *
     * @return list<array{id: string, name: string, url: string, category: string, tagline: string, native: ?string}>
     */
    public static function available(): array
    {
        if (!config('chat_connectors.enabled') || !config('agents_v2_mcp.enabled')) return [];
        return array_values(array_map(fn (array $p) => [
            'id' => (string) $p['id'], 'name' => (string) $p['name'], 'url' => (string) $p['url'],
            'category' => (string) $p['category'], 'tagline' => (string) $p['tagline'],
            'native' => isset($p['native']) ? (string) $p['native'] : null,
        ], (array) config('agents_v2_mcp_presets.presets', [])));
    }
}
