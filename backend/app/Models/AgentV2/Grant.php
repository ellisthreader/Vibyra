<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** What one teammate may do with one connection. Connection alone never grants access. */
final class Grant extends Model
{
    use HasUuids;

    protected $table = 'agent_grants';
    protected $guarded = [];
    protected $hidden = [];

    protected function casts(): array
    {
        return ['operations' => 'array', 'revision' => 'integer', 'revoked_at' => 'datetime'];
    }
}
