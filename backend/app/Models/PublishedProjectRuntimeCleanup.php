<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'user_id',
    'provider',
    'provider_project_id',
    'provider_service_id',
    'status',
    'reason',
    'attempts',
    'last_error',
    'next_attempt_at',
    'completed_at',
])]
class PublishedProjectRuntimeCleanup extends Model
{
    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'next_attempt_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }
}
