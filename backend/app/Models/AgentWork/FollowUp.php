<?php
namespace App\Models\AgentWork;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class FollowUp extends Model
{
    use HasUuids;
    protected $table = 'agent_work_followups';
    protected $guarded = [];
    protected function casts(): array
    {
        return ['runtime_snapshot' => 'array', 'source_snapshot' => 'array', 'condition' => 'array', 'revision' => 'integer',
            'trigger_revision' => 'integer', 'signal_cursor' => 'integer', 'expires_at' => 'datetime',
            'due_at' => 'datetime', 'activated_at' => 'datetime'];
    }
}
