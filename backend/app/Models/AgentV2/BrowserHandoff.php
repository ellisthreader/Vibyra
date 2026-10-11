<?php
namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

final class BrowserHandoff extends Model
{
    use HasUuids;
    protected $table = 'agent_browser_handoffs';
    protected $guarded = [];
    protected $hidden = ['frame', 'command', 'viewer_session_id'];
    protected function casts(): array
    {
        return ['frame' => 'encrypted:array', 'command' => 'encrypted:array', 'expires_at' => 'datetime',
            'generation' => 'integer', 'revision' => 'integer', 'frame_sequence' => 'integer',
            'command_sequence' => 'integer', 'acknowledged_sequence' => 'integer'];
    }
}
