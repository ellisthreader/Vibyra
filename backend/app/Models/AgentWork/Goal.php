<?php
namespace App\Models\AgentWork;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class Goal extends Model
{
    use HasUuids;
    protected $table = 'agent_work_goals';
    protected $guarded = [];
    protected function casts(): array
    {
        return ['runtime_snapshot' => 'array', 'milestones' => 'array', 'revision' => 'integer', 'expires_at' => 'datetime'];
    }
}
