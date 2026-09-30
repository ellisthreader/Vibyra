<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** The AI account a Mac runner uses for Agent runs. Holds references, never AI login secrets. */
final class RuntimeBinding extends Model
{
    use HasUuids;

    protected $table = 'agent_runtime_bindings';
    protected $guarded = [];
    protected $hidden = ['runner_key_hash'];

    protected function casts(): array
    {
        return ['capabilities' => 'array', 'revision' => 'integer', 'last_seen_at' => 'datetime', 'revoked_at' => 'datetime'];
    }
}
