<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'event_id',
    'type',
    'object_type',
    'object_id',
    'event_created_at',
    'status',
    'attempts',
    'processed_at',
    'last_error',
])]
class StripeWebhookEvent extends Model
{
    protected function casts(): array
    {
        return [
            'event_created_at' => 'datetime',
            'processed_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }
}
