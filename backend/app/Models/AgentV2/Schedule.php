<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** A saved routine: one teammate prompt on a wall-clock recurrence in an IANA timezone. */
final class Schedule extends Model
{
    use HasUuids;

    protected $table = 'agent_schedules';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['recurrence' => 'array', 'revision' => 'integer', 'catch_up_minutes' => 'integer',
            'next_run_at' => 'datetime', 'paused_at' => 'datetime', 'deleted_at' => 'datetime'];
    }
}
