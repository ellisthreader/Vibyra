<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One standing approval rule: "always allow" or "always ask" for a tool on one connection (and optionally one scope). */
final class ApprovalRule extends Model
{
    use HasUuids;

    protected $table = 'agent_approval_rules';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'revoked_at' => 'datetime', 'last_used_at' => 'datetime', 'use_count' => 'integer',
            'revision' => 'integer', 'max_uses' => 'integer', 'connection_generation' => 'integer', 'grant_revision' => 'integer'];
    }
}
