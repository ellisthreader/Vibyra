<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'reference',
    'status',
    'model_key',
    'model_slug',
    'reserved_credits',
    'reserved_micro_usd',
    'actual_credits',
    'actual_micro_usd',
    'input_tokens',
    'output_tokens',
    'attempts',
    'meta',
    'expires_at',
    'provider_started_at',
    'settled_at',
    'released_at',
    'release_reason',
])]
class ChatCostReservation extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_SETTLING = 'settling';
    public const STATUS_SETTLED = 'settled';
    public const STATUS_RELEASED = 'released';
    public const STATUS_EXPIRED = 'expired';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_SETTLING,
        self::STATUS_SETTLED,
        self::STATUS_RELEASED,
        self::STATUS_EXPIRED,
    ];

    protected function casts(): array
    {
        return [
            'reserved_credits' => 'integer',
            'reserved_micro_usd' => 'integer',
            'actual_credits' => 'integer',
            'actual_micro_usd' => 'integer',
            'input_tokens' => 'integer',
            'output_tokens' => 'integer',
            'attempts' => 'array',
            'meta' => 'array',
            'expires_at' => 'datetime',
            'provider_started_at' => 'datetime',
            'settled_at' => 'datetime',
            'released_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
