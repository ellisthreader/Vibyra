<?php
namespace App\Models\AgentChannels;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
final class Identity extends Model
{
    use HasUuids;
    protected $table = 'agent_channel_identities';
    protected $guarded = [];
    protected function casts(): array { return ['connection_generation'=>'integer','reply_connection_generation'=>'integer','revision'=>'integer']; }
}
