<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class Output extends Model
{
    use HasUuids;
    protected $table = 'agent_outputs';
    protected $guarded = [];
    protected function casts(): array
    {
        return ['revision' => 'integer', 'content' => 'array', 'sources' => 'array'];
    }
}
