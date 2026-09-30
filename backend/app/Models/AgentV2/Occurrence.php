<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One intended time of one schedule revision; unique, so a retried claim finds its run. */
final class Occurrence extends Model
{
    use HasUuids;

    protected $table = 'agent_schedule_occurrences';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['revision' => 'integer', 'intended_at' => 'datetime'];
    }
}
