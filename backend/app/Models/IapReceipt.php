<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'platform',
    'product_id',
    'transaction_id',
    'client_transaction_id',
    'original_transaction_id',
    'environment',
    'purchase_state',
    'expires_at',
    'payload',
])]
class IapReceipt extends Model
{
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'payload' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
