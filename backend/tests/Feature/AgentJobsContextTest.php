<?php
namespace Tests\Feature;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Runs;
use Illuminate\Support\Facades\DB;

final class AgentJobsContextTest extends AgentJobsTestCase
{
    public function test_admission_pins_profile_and_completed_history_without_unfinished_peer_content(): void
    {
        $this->job('past'); $past = $this->slot(0); $this->finish($past, 'Existing history');
        $waiting = $this->job('waiting'); $peer = $this->job('peer'); $this->slot(0);
        $peerClaim = $this->slot(1); $this->assertSame($peer['id'], $peerClaim['id']);
        $this->finish($peerClaim, 'Secret later peer result');
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['name' => 'Changed later', 'brief' => 'New later instructions']);
        $payload = app(Runs::class)->claimPayload(Run::find($waiting['id']), []);
        $this->assertSame('Inbox', $payload['profile']['name']);
        $this->assertStringStartsWith('Summarize mail.', $payload['profile']['brief']);
        $this->assertStringNotContainsString('New later instructions', $payload['profile']['brief']);
        $this->assertCount(1, $payload['history']);
        $this->assertSame('Existing history', $payload['history'][0]['answer']);
        $this->assertStringNotContainsString('Secret later', json_encode($payload));
    }
    public function test_forgetting_memory_removes_it_from_already_queued_frozen_context(): void
    {
        $path = '/api/agents/v2/teammates/'.$this->agent['id'].'/memories';
        $view = $this->getJson($path)->assertOk()->json();
        $scope = ['runtimeId' => $view['runtimeId'], 'accountScope' => $view['accountScope']];
        $memory = $this->postJson($path, [...$scope, 'fact' => 'Timezone London'])->assertCreated()->json('memory');
        $job = $this->job('frozen', 'independent', 'Use my timezone');
        $payload = fn () => app(Runs::class)->claimPayload(Run::find($job['id']), []);
        $this->assertStringContainsString('London', $payload()['profile']['memory']);
        $this->patchJson($path.'/'.$memory['id'], [...$scope, 'revision' => $memory['revision'], 'action' => 'forget'])->assertOk();
        $this->assertStringNotContainsString('London', $payload()['profile']['memory']);
    }
}
