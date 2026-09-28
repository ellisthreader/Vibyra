<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Who connected to what, and when. Deliberately never what happened inside the
 * terminal: the relay cannot read that and this table must not learn to.
 */
class RemoteAuditEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'remote_host_id', 'event', 'detail', 'created_at'];

    protected function casts(): array
    {
        return ['detail' => 'array', 'created_at' => 'datetime'];
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(RemoteHost::class, 'remote_host_id');
    }
}
