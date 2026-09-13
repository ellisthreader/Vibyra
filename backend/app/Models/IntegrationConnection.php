<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IntegrationConnection extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'integration_connections';

    protected $guarded = [];

    protected $hidden = ['credentials', 'payload', 'state_hash'];

    protected function casts(): array
    {
        return ['credentials' => 'encrypted:array', 'expires_at' => 'datetime'];
    }
}
