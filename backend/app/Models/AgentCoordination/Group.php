<?php
namespace App\Models\AgentCoordination;
use Illuminate\Database\Eloquent\{Model, Concerns\HasUuids};
final class Group extends Model
{
    use HasUuids;
    protected $table = 'agent_groups'; protected $guarded = [];
    protected function casts(): array { return ['members' => 'array', 'revision' => 'integer', 'deleted_at' => 'datetime']; }
}
