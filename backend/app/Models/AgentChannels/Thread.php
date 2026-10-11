<?php
namespace App\Models\AgentChannels;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
final class Thread extends Model
{
    use HasUuids;
    protected $table = 'agent_channel_threads';
    protected $guarded = [];
    protected function casts(): array { return ['destination'=>'encrypted:array']; }
}
