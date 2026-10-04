<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** A personal API key. Only the SHA-256 of the secret is stored; the secret itself is shown once at creation. */
final class ApiKey extends Model
{
    use HasUuids;

    protected $guarded = [];
    protected $hidden = ['key_hash'];

    protected function casts(): array
    {
        return ['scopes' => 'array', 'rate_per_minute' => 'integer', 'last_used_at' => 'datetime', 'revoked_at' => 'datetime'];
    }
}
