<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** A remote MCP server a person added, with the tool list they reviewed pinned by revision. */
final class McpServer extends Model
{
    use HasUuids;

    protected $table = 'agent_mcp_servers';
    protected $guarded = [];
    protected $hidden = ['oauth'];

    protected function casts(): array
    {
        return ['oauth' => 'encrypted:array', 'tools' => 'array', 'pending_tools' => 'array', 'read_tools' => 'array'];
    }
}
