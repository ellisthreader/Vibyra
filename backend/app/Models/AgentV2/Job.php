<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Model;

/** Immutable task context and conflict boundary, separate from the run journal. */
final class Job extends Model
{
    protected $table = 'agent_run_jobs';
    protected $primaryKey = 'run_id';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['context' => 'encrypted:array', 'write_epoch' => 'integer'];
    }
}
