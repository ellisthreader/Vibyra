<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One admitted Agent task. Prompt and attachments are immutable after admission. */
final class Run extends Model
{
    use HasUuids;

    protected $table = 'agent_runs';
    protected $guarded = [];
    protected $hidden = [];

    protected function casts(): array
    {
        return ['instruction_revision' => 'integer', 'applied_instruction_revision' => 'integer', 'attachments' => 'array', 'grant_snapshot' => 'array', 'runtime_snapshot' => 'array', 'lease_generation' => 'integer', 'event_seq' => 'integer', 'lease_expires_at' => 'datetime', 'cancel_requested_at' => 'datetime', 'started_at' => 'datetime', 'finished_at' => 'datetime', 'resume_after' => 'datetime', 'wait_revision' => 'integer'];
    }
}
