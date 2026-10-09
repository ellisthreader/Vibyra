<?php
namespace App\Models\AgentCoordination;
use Illuminate\Database\Eloquent\{Model, Concerns\HasUuids};
final class Workflow extends Model
{
    use HasUuids;
    protected $table = 'agent_workflows'; protected $guarded = [];
    protected function casts(): array { return ['mentions' => 'array', 'group_revision' => 'integer', 'revision' => 'integer',
        'runtime_snapshot' => 'array', 'prompt' => 'encrypted', 'member_snapshots' => 'encrypted:array',
        'shared_context' => 'encrypted:array', 'steps' => 'encrypted:array', 'final_criteria' => 'encrypted',
        'expires_at' => 'datetime', 'checked_at' => 'datetime']; }
}
