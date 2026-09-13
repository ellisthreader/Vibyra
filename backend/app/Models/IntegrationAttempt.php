<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;

class IntegrationAttempt extends Model
{
    use MassPrunable;

    public function prunable(): Builder
    {
        return static::where('expires_at', '<', now()->subDay());
    }

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'integration_attempts';

    protected $guarded = [];

    protected $hidden = ['credentials', 'payload', 'state_hash'];

    protected function casts(): array
    {
        return ['payload' => 'encrypted:array', 'expires_at' => 'datetime'];
    }
}
