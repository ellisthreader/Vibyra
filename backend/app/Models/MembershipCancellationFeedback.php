<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'plan',
    'billing_cycle',
    'billing_provider',
    'reason',
    'details',
    'status',
    'confirmed_at',
    'completed_at',
    'metadata',
])]
class MembershipCancellationFeedback extends Model
{
    protected $table = 'membership_cancellation_feedback';

    protected function casts(): array
    {
        return [
            'confirmed_at' => 'datetime',
            'completed_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
