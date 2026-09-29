<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One connection grant handed to a phone, and the relay session it opened. */
class RemoteSession extends Model
{
    protected $fillable = [
        'user_id', 'remote_host_id', 'grant_id', 'client_name', 'relay_client_id',
        'issued_at', 'started_at', 'ended_at', 'authorization_generation',
        'app_session_id', 'status', 'admitted_at', 'expires_at', 'revoked_at', 'trusted_device_id',
        'permissions', 'authorized_at', 'last_activity_at',
    ];

    protected function casts(): array
    {
        return [
            'issued_at' => 'datetime',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'admitted_at' => 'datetime',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'app_session_id' => 'integer',
            'trusted_device_id' => 'integer',
            'permissions' => 'array',
            'authorized_at' => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(RemoteHost::class, 'remote_host_id');
    }

    public function trustedDevice(): BelongsTo
    {
        return $this->belongsTo(TrustedDevice::class);
    }
}
