<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A computer an account can reach through Vibyra Cloud, identified by its Noise public key. */
class RemoteHost extends Model
{
    protected $fillable = [
        'user_id', 'host_id', 'name', 'platform', 'app_version', 'registered_at',
        'last_seen_at', 'online_until', 'relay_id', 'revoked_at',
    ];

    protected function casts(): array
    {
        return [
            'registered_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'online_until' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(RemoteSession::class);
    }

    public function isOnline(): bool
    {
        return $this->revoked_at === null && $this->online_until !== null && $this->online_until->isFuture();
    }
}
