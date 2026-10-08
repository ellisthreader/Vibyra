<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One brokered tool call with exact canonical arguments and, for writes, an approval fingerprint. */
final class ToolAction extends Model
{
    use HasUuids;

    protected $table = 'agent_tool_actions';
    protected $guarded = [];
    protected $hidden = [];

    protected function casts(): array
    {
        return ['arguments' => 'array', 'result' => 'array', 'secret_kinds' => 'array', 'expires_at' => 'datetime', 'dispatched_at' => 'datetime', 'connection_generation' => 'integer', 'grant_revision' => 'integer'];
    }
}
