<?php
namespace App\Models\AgentChannels;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
final class InboundEvent extends Model
{
    use HasUuids;
    protected $table = 'agent_channel_events';
    protected $guarded = [];
    protected function casts(): array { return ['destination'=>'encrypted:array','text'=>'encrypted','binding_revision'=>'integer','received_at'=>'datetime']; }
}
