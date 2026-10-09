<?php
namespace App\Models\AgentCoordination;
use Illuminate\Database\Eloquent\{Model, Concerns\HasUuids};
final class Message extends Model
{
    use HasUuids;
    protected $table = 'agent_group_messages'; protected $guarded = [];
    protected function casts(): array { return ['mentions' => 'array', 'group_revision' => 'integer', 'runtime_snapshot' => 'array',
        'prompt' => 'encrypted', 'member_snapshots' => 'encrypted:array', 'shared_context' => 'encrypted:array']; }
}
