<?php
namespace App\Models\AgentCapabilities;
use Illuminate\Database\Eloquent\{Model, Concerns\HasUuids};
final class Installation extends Model
{
    use HasUuids;
    protected $table = 'agent_capability_installations';
    protected $guarded = [];
    protected function casts(): array
    {
        return ['operations' => 'array', 'revision' => 'integer', 'connection_generation' => 'integer', 'revoked_at' => 'datetime'];
    }
}
