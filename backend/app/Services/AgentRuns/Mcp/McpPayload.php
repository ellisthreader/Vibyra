<?php

namespace App\Services\AgentRuns\Mcp;

use App\Models\AgentV2\McpServer;
use App\Services\AgentRuns\Tools\Providers\ProviderTools;

/** The pinned tool list and the pending (changed) list of an MCP server as a client sees them, remote or local. */
final class McpPayload
{
    public static function tools(McpServer $s, ProviderTools $adapter): array
    {
        $kinds = $adapter->tools();
        return collect($s->tools ?? [])->map(fn ($t) => self::tool($t, $kinds[$t['tool']] ?? 'write'))->values()->all();
    }

    public static function pending(McpServer $s, ProviderTools $adapter): ?array
    {
        if (!$s->pending_tools) return null;
        $kinds = $adapter->tools();
        $pinned = collect($s->tools ?? [])->keyBy('tool');
        $pending = collect($s->pending_tools)->keyBy('tool');
        return ['revision' => $s->pending_revision, 'added' => $pending->keys()->diff($pinned->keys())->values()->all(),
            'removed' => $pinned->keys()->diff($pending->keys())->values()->all(),
            'changed' => $pending->filter(fn ($t, $k) => isset($pinned[$k]) && ToolList::toolHash($t) !== ToolList::toolHash($pinned[$k]))->keys()->values()->all(),
            'tools' => $pending->values()->map(fn ($t) => self::tool($t, $kinds[$t['tool']] ?? 'write'))->all()];
    }

    private static function tool(array $t, string $kind): array
    {
        return ['tool' => $t['tool'], 'remoteName' => $t['remote'], 'description' => $t['description'], 'kind' => $kind,
            'readOnlyHint' => (bool) $t['readOnlyHint'], 'destructiveHint' => (bool) ($t['destructiveHint'] ?? false), 'inputSchema' => $t['inputSchema']];
    }
}
