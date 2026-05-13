<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'user_id',
    'action',
    'context_hash',
    'xp_delta',
    'level_before',
    'level_after',
    'meta',
])]
class UserLevelEvent extends Model
{
    protected function casts(): array
    {
        return [
            'xp_delta' => 'integer',
            'level_before' => 'integer',
            'level_after' => 'integer',
            'meta' => 'array',
        ];
    }
}
