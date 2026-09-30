<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Model;

/** One journal entry. `seq` is monotonic per run; clients replay after a cursor. */
final class RunEvent extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'agent_run_events';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['payload' => 'array', 'seq' => 'integer', 'created_at' => 'datetime'];
    }
}
