<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One external account (Gmail address, GitHub login...) with a stable ID. Credentials never leave the server. */
final class Connection extends Model
{
    use HasUuids;

    protected $table = 'agent_connections';
    protected $guarded = [];
    protected $hidden = ['credential', 'refresh_token'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'install_connected_at' => 'datetime', 'revoked_at' => 'datetime', 'scopes' => 'array', 'generation' => 'integer'];
    }
}
