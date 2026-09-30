<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** The provider-side outcome of one tool action: confirmed, failed or unknown. */
final class Receipt extends Model
{
    use HasUuids;

    protected $table = 'agent_receipts';
    protected $guarded = [];
    protected $hidden = [];

    protected function casts(): array
    {
        return [];
    }
}
