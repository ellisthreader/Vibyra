<?php
namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class WorkProposal extends Model
{
    use HasUuids;
    protected $table = 'agent_work_proposals';
    protected $guarded = [];
    protected function casts(): array
    {
        return ['spec' => 'encrypted:array', 'runtime_snapshot' => 'array', 'activation' => 'array',
            'revision' => 'integer', 'accepted_revision' => 'integer', 'expires_at' => 'datetime'];
    }
}
