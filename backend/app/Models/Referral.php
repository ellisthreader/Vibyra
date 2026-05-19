<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'referrer_user_id',
    'referred_user_id',
    'code',
    'signup_reward_granted_at',
    'paid_reward_granted_at',
    'paid_plan',
    'paid_provider',
])]
class Referral extends Model
{
    protected function casts(): array
    {
        return [
            'signup_reward_granted_at' => 'datetime',
            'paid_reward_granted_at' => 'datetime',
        ];
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referrer_user_id');
    }

    public function referred(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referred_user_id');
    }
}
