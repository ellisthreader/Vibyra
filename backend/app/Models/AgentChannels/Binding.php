<?php
namespace App\Models\AgentChannels;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
final class Binding extends Model
{
    use HasUuids;
    protected $table = 'agent_channel_bindings';
    protected $guarded = [];
    protected function casts(): array { return ['runtime_snapshot'=>'encrypted:array','public_instructions'=>'encrypted','revision'=>'integer','rate_per_hour'=>'integer','expires_at'=>'datetime','revoked_at'=>'datetime']; }
}
