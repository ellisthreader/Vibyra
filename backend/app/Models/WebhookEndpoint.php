<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** An account's outbound webhook endpoint. The signing secret is encrypted at rest and shown once. */
final class WebhookEndpoint extends Model
{
    use HasUuids;

    protected $guarded = [];
    protected $hidden = ['secret'];

    protected function casts(): array
    {
        return ['events' => 'array', 'failures' => 'integer', 'paused_at' => 'datetime', 'deleted_at' => 'datetime'];
    }
}
