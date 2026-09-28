<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'object_type',
    'object_id',
    'last_event_id',
    'last_event_created_at',
])]
class StripeWebhookObjectState extends Model
{
    protected function casts(): array
    {
        return ['last_event_created_at' => 'datetime'];
    }
}
