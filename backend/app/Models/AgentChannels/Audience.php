<?php
namespace App\Models\AgentChannels;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
final class Audience extends Model
{
    use HasUuids;
    protected $table = 'agent_channel_audiences';
    protected $guarded = [];
    protected function casts(): array { return ['destination'=>'encrypted:array','last_seen_at'=>'datetime']; }
}
