<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One event for one endpoint: the queue's unit of work and the person's delivery log. */
final class WebhookDelivery extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['payload' => 'array', 'attempts' => 'integer', 'next_attempt_at' => 'datetime', 'delivered_at' => 'datetime',
            'created_at' => 'datetime'];
    }
}
