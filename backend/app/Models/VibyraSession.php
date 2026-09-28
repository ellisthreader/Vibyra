<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VibyraSession extends Model
{
    protected $fillable = [
        'user_id',
        'token_hash',
        'previous_token_hash',
        'previous_token_expires_at',
        'device_name',
        'device_identifier',
        'ip_address',
        'user_agent',
        'last_used_at',
        'idle_expires_at',
        'absolute_expires_at',
        'rotated_at',
        'revoked_at',
        'revocation_reason',
    ];

    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
            'previous_token_expires_at' => 'datetime',
            'idle_expires_at' => 'datetime',
            'absolute_expires_at' => 'datetime',
            'rotated_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function revoke(string $reason): bool
    {
        return $this->forceFill([
            'previous_token_hash' => null,
            'previous_token_expires_at' => null,
            'revoked_at' => now(),
            'revocation_reason' => mb_substr($reason, 0, 80),
        ])->save();
    }
}
