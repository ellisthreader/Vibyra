<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One connection grant handed to a phone, and the relay session it opened. */
class RemoteSession extends Model
{
    protected $fillable = [
        'user_id', 'remote_host_id', 'grant_id', 'client_name', 'relay_client_id',
        'issued_at', 'started_at', 'ended_at',
    ];

    protected function casts(): array
    {
        return [
            'issued_at' => 'datetime',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(RemoteHost::class, 'remote_host_id');
    }
}
