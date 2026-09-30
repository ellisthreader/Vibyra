<?php

namespace App\Services\AgentRuns\Tools;

use App\Services\AgentRuns\Tools\Providers\Adapters;
use Illuminate\Support\Facades\DB;

/**
 * Which provider a tool call belongs to, for run actions and journal events, so
 * clients never guess from tool-name prefixes. The call's own connection is the
 * authority; the tool name is the fallback (MCP/Composio names carry their provider).
 */
final class ToolProviders
{
    /** @var array<string, ?string> */
    private array $byTool = [];
    /** @var array<string, ?string> */
    private array $byConnection = [];

    public function of(string $tool, ?string $connectionId = null, ?int $userId = null): ?string
    {
        if ($connectionId && $userId) {
            if (!array_key_exists($connectionId, $this->byConnection))
                $this->byConnection[$connectionId] = DB::table('agent_connections')->where('id', $connectionId)
                    ->where('user_id', $userId)->value('provider');
            if ($this->byConnection[$connectionId]) return $this->byConnection[$connectionId];
        }
        if (preg_match('/^(mcp_[0-9a-f]{8}|composio_[a-z0-9]{2,40})__/D', $tool, $m)) return $m[1];
        return $this->byTool[$tool] ??= app(Adapters::class)->providerOfTool($tool);
    }
}
