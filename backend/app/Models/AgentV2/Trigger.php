<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** An event source (webhook or poll) that admits one teammate run per matching event. */
final class Trigger extends Model
{
    use HasUuids;

    protected $table = 'agent_triggers';
    protected $guarded = [];
    protected $hidden = ['secret'];

    protected function casts(): array
    {
        return ['filter' => 'array', 'cursor' => 'array', 'rate_per_hour' => 'integer', 'revision' => 'integer',
            'polled_at' => 'datetime', 'paused_at' => 'datetime', 'deleted_at' => 'datetime'];
    }
}
