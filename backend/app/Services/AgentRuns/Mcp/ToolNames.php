<?php

namespace App\Services\AgentRuns\Mcp;

/**
 * The model-facing name of an MCP tool: `<provider slug>__<safe name>`. The Mac refuses a manifest
 * whose tool names are not `^[a-z0-9_]{1,40}$` (`agent_v2/tools.rs::valid_tool`; 40 keeps
 * `mcp__vibyra-broker__<name>` inside the 64-character limit model APIs put on a tool name), and one bad name
 * fails the whole run at preflight. So a long remote name is shortened to fit with a hash of the
 * original, never cut blindly: two long names with the same start stay different, and the same
 * remote name always maps to the same tool name, so grants keep pointing at it.
 */
final class ToolNames
{
    public const MAX = 40;

    public static function make(string $slug, string $remote): ?string
    {
        $safe = trim((string) preg_replace('/[^a-z0-9_]+/', '_', strtolower($remote)), '_');
        if ($safe === '') return null;
        $room = self::MAX - strlen($slug) - 2;
        if (strlen($safe) <= $room) return $slug.'__'.$safe;
        return $slug.'__'.rtrim(substr($safe, 0, $room - 9), '_').'_'.substr(hash('sha256', $remote), 0, 8);
    }
}
