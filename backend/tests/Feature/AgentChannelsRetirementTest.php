<?php
namespace Tests\Feature;

use App\Models\AgentChannels\{Binding, Identity, InboundEvent};
use App\Services\AgentChannels\Intake;
use Illuminate\Support\Facades\DB;

final class AgentChannelsRetirementTest extends AgentChannelsTestCase
{
    public function test_retirement_cancels_only_pending_teams_events_and_keeps_thread_history(): void
    {
        app(Intake::class)->accept($this->envelope());
        $event = InboundEvent::where('provider_event_id', 'EvMESSAGE01')->sole();
        $slack = $this->bot->replicate(); $slack->save();
        $this->bot->forceFill(['provider' => 'teams'])->save();
        Identity::whereKey($this->identity['id'])->update(['provider' => 'teams']);
        $done = $event->replicate();
        $done->forceFill(['event_hash' => hash('sha256', 'completed'), 'provider_event_id' => 'completed', 'state' => 'admitted'])->save();
        $threads = DB::table('agent_channel_threads')->count();
        $migration = require database_path('migrations/2026_10_11_010100_retire_microsoft_integrations.php');
        $migration->up();
        $this->assertSame('cancelled', $event->fresh()->state);
        $this->assertSame('admitted', $done->fresh()->state);
        $this->assertNotNull(Binding::findOrFail($this->binding['id'])->revoked_at);
        $this->assertSame(2, Binding::findOrFail($this->binding['id'])->revision);
        $this->assertSame($threads, DB::table('agent_channel_threads')->count());
        $this->assertNull($this->bot->fresh()->credential);
        $this->assertNull($slack->fresh()->revoked_at);
        $this->assertNotNull($slack->fresh()->credential);
        $this->getJson('/api/agents/v2/channels')->assertOk()->assertJsonCount(0, 'identities')->assertJsonCount(0, 'bindings');
        $this->getJson('/api/agents/v2/channels/'.$this->binding['id'])->assertOk();
    }
}
