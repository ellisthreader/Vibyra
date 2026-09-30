<?php

namespace App\Models\AgentV2;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One received event, unique per trigger + provider event ID; a redelivery never starts a second run. */
final class TriggerEvent extends Model
{
    use HasUuids;

    protected $table = 'agent_trigger_events';
    protected $guarded = [];

    protected function casts(): array
    {
        return ['summary' => 'array'];
    }
}
