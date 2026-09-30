<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Trust belongs to one computer and its current ownership generation. */
class TrustedDevice extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['authorization_generation' => 'integer', 'approved_revision' => 'integer', 'revocation_revision' => 'integer', 'approved_at' => 'datetime', 'denied_at' => 'datetime',
            'revoked_at' => 'datetime', 'request_expires_at' => 'datetime', 'last_seen_at' => 'datetime', 'permissions' => 'array'];
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(RemoteHost::class, 'remote_host_id');
    }

    public function trusted(): bool
    {
        return $this->approved_at !== null && $this->revoked_at === null && $this->denied_at === null
            && $this->host !== null && $this->host->revoked_at === null
            && (string) $this->host->user_id === (string) $this->user_id
            && $this->host->authorization_generation === $this->authorization_generation;
    }
}
