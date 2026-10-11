<?php
namespace Tests\Feature;

use App\Models\AgentV2\{BrowserHandoff, RuntimeBinding, ToolAction};
use App\Models\VibyraSession;
use App\Services\AgentRuns\Browser\BrowserGrants;
use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Support\Facades\DB;

final class AgentCloudBrowserTest extends AgentCloudTestCase
{
    private array $registration;
    private array $claimed;
    private array $action;
    private string $base;
    private string $connection;

    private function prepare(): void
    {
        config(['agents_v2_browser.enabled' => true, 'agents_v2_browser.cloud_enabled' => true]);
        $p = $this->policy();
        $this->registration = $this->asRuntime($this->cloudToken, 'post', 'agents/register', [
            'generation' => $this->row()->generation, 'runtimeId' => $p['runtimeId'], 'provider' => 'claude',
            'accountId' => 'cloud', 'model' => 'sonnet', 'effort' => 'high', 'capabilities' => [
                'controlledTools' => true, 'taskSteering' => true, 'browserTools' => true,
                'cloudPrivateBrowserV1' => true, 'browserUploadsV1' => true]])->assertOk()->json();
        $grant = app(BrowserGrants::class)->put($this->user->id, $this->agentId, ['https://shop.example.com'], null,
            ['runtimeId' => $p['runtimeId']]);
        $this->connection = $grant['connectionId'];
        $this->admit($p);
        $this->base = '/api/agents/v2/runner/'.$p['runtimeId'];
        $this->claimed = $this->postJson($this->base.'/claim', [], $this->key('runnerKey'))->assertOk()->json('run');
        $this->action = $this->postJson($this->base.'/runs/'.$this->claimed['id'].'/tools', [
            'generation' => $this->claimed['generation'], 'callId' => 'private-sign-in', 'connectionId' => $this->connection,
            'tool' => 'browser_takeover_request', 'schemaRevision' => app(ToolCatalog::class)->schemaRevision('browser_takeover_request'),
            'arguments' => ['reason' => 'Sign in privately.']], $this->key('runnerKey'))->assertOk()->assertJsonPath('action.state', 'approved')->json('action');
        $this->postJson($this->actionPath().'/claim', ['generation' => $this->claimed['generation'],
            'fingerprint' => ToolAction::findOrFail($this->action['id'])->fingerprint], $this->key('browserKey'))->assertOk();
    }

    private function key(string $key): array { return ['X-Vibyra-Runner-Key' => $this->registration[$key]]; }
    private function actionPath(): string { return $this->base.'/runs/'.$this->claimed['id'].'/browser/'.$this->action['id']; }
    private function begin(): array
    {
        return $this->postJson($this->actionPath().'/handoff', ['generation' => $this->claimed['generation'],
            'origin' => 'https://shop.example.com'], $this->key('browserKey'))->assertOk()->json('handoff');
    }
    private function frame(): array
    {
        return ['image' => base64_encode(file_get_contents(base_path('tests/Fixtures/private-browser.jpg'))), 'width' => 1280, 'height' => 800];
    }
    private function exchange(string $id, array $extra = [])
    {
        return $this->postJson($this->base.'/browser/private/'.$id.'/exchange', ['generation' => $this->claimed['generation'],
            'frameSequence' => 0, 'acknowledgedSequence' => 0, ...$extra], $this->key('browserKey'));
    }

    public function test_private_helper_key_is_separate_from_model_and_owner_authority(): void
    {
        $this->prepare();
        $this->assertNotSame($this->registration['runnerKey'], $this->registration['browserKey']);
        $this->getJson($this->base.'/browser-runs', $this->key('runnerKey'))->assertForbidden();
        $this->getJson($this->base.'/browser-runs', $this->key('browserKey'))->assertOk()->assertJsonCount(1, 'runs');
        $this->postJson($this->base.'/claim', [], $this->key('browserKey'))->assertForbidden();
        $this->getJson('/api/agents/v2/browser/private', $this->key('browserKey'))->assertForbidden();
        $b = RuntimeBinding::findOrFail($this->registration['runtimeId']);
        $this->assertArrayNotHasKey('browser_key_hash', $b->toArray());
        config(['agents_v2_browser.cloud_enabled' => false]);
        $this->getJson($this->base.'/browser-runs', $this->key('browserKey'))->assertForbidden();
    }

    public function test_frames_and_inputs_are_session_bound_encrypted_and_delivered_once(): void
    {
        $this->prepare(); $h = $this->begin(); $path = '/api/agents/v2/browser/private/'.$h['id'];
        $this->getJson($path.'/frame')->assertStatus(409);
        $opened = $this->postJson($path.'/open', ['expectedRevision' => $h['revision']])->assertOk()->json('handoff');
        $this->exchange($h['id'], ['frameSequence' => 1, 'frame' => $this->frame()])->assertOk();
        $view = $this->getJson($path.'/frame')->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->assertSame($this->frame(), $view['frame']);
        $secret = 'fixture-only-private-input';
        $body = ['expectedRevision' => $opened['revision'], 'frameSequence' => 1, 'sequence' => 1, 'command' => ['kind' => 'text', 'text' => $secret]];
        $this->postJson($path.'/input', $body)->assertOk();
        $raw = DB::table('agent_browser_handoffs')->where('id', $h['id'])->first();
        $this->assertStringNotContainsString($secret, $raw->command);
        $this->assertStringNotContainsString(substr($this->frame()['image'], 0, 100), $raw->frame);
        $this->postJson($path.'/input', $body)->assertStatus(409);
        $this->exchange($h['id'])->assertOk()->assertJsonPath('command.input.text', $secret);
        $this->exchange($h['id'])->assertOk()->assertJsonPath('command', null);
        $this->exchange($h['id'], ['acknowledgedSequence' => 1])->assertOk()->assertJsonPath('handoff.acknowledgedSequence', 1);
        $this->assertStringNotContainsString($secret, $this->getJson('/api/agents/v2/runs/'.$this->claimed['id'])->assertOk()->getContent());
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'second-device'), 'device_name' => 'Other',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $this->withToken('second-device')->getJson($path.'/frame')->assertStatus(409);
        $this->postJson($path.'/open', ['expectedRevision' => $opened['revision']])->assertStatus(409);
    }

    public function test_expiry_revokes_control_erases_private_state_and_never_resumes_the_task(): void
    {
        $this->prepare(); $h = $this->begin();
        BrowserHandoff::whereKey($h['id'])->update(['expires_at' => now()->subSecond()]);
        $this->exchange($h['id'])->assertStatus(409);
        $this->artisan('vibyra:agent-browser-prune')->assertSuccessful();
        $this->assertDatabaseCount('agent_browser_handoffs', 0);
        $this->assertDatabaseHas('agent_runs', ['id' => $this->claimed['id'], 'state' => 'failed']);
    }

    public function test_resume_requires_once_only_delivery_then_helper_acknowledgement(): void
    {
        $this->prepare(); $h = $this->begin(); $path = '/api/agents/v2/browser/private/'.$h['id'];
        $opened = $this->postJson($path.'/open', ['expectedRevision' => $h['revision']])->assertOk()->json('handoff');
        $this->exchange($h['id'], ['frameSequence' => 1, 'frame' => $this->frame()])->assertOk();
        $this->postJson($path.'/input', ['expectedRevision' => $opened['revision'], 'frameSequence' => 1,
            'sequence' => 1, 'command' => ['kind' => 'resume']])->assertOk()->assertJsonPath('handoff.state', 'resuming');
        $this->exchange($h['id'], ['acknowledgedSequence' => 1])->assertStatus(409);
        $this->exchange($h['id'])->assertOk()->assertJsonPath('command.input.kind', 'resume');
        $this->exchange($h['id'])->assertOk()->assertJsonPath('command', null)->assertJsonPath('handoff.state', 'resuming');
        $this->exchange($h['id'], ['acknowledgedSequence' => 1])->assertOk()->assertJsonPath('handoff.state', 'resumed');
        $this->getJson($path.'/frame')->assertStatus(409);
        $this->assertNull(BrowserHandoff::findOrFail($h['id'])->frame);
        $this->artisan('vibyra:agent-browser-prune')->assertSuccessful();
        $this->assertDatabaseCount('agent_browser_handoffs', 0);
        $this->assertDatabaseMissing('agent_runs', ['id' => $this->claimed['id'], 'state' => 'failed']);
    }

    public function test_other_accounts_and_revoked_viewers_cannot_observe_or_control_private_frames(): void
    {
        $this->prepare(); $h = $this->begin(); $path = '/api/agents/v2/browser/private/'.$h['id'];
        $this->postJson($path.'/open', ['expectedRevision' => $h['revision']])->assertOk();
        $this->exchange($h['id'], ['frameSequence' => 1, 'frame' => $this->frame()])->assertOk();
        $owner = BrowserHandoff::findOrFail($h['id'])->viewer_session_id;
        $other = \App\Models\User::factory()->create();
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other-account'), 'device_name' => 'Other',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $this->withToken('other-account')->getJson($path.'/frame')->assertNotFound();
        $this->postJson($path.'/open', ['expectedRevision' => $h['revision']])->assertNotFound();
        VibyraSession::whereKey($owner)->update(['revoked_at' => now()]);
        $this->exchange($h['id'])->assertStatus(409);
    }

    public function test_switching_target_revokes_old_profile_and_mac_access_never_transfers_implicitly(): void
    {
        $this->prepare();
        $old = app(BrowserGrants::class)->show($this->user->id, $this->agentId);
        $mac = app(BrowserGrants::class)->put($this->user->id, $this->agentId, $old['origins'], null, ['runtimeId' => null]);
        $this->assertNotSame($old['connectionId'], $mac['connectionId']);
        $this->assertNull($mac['runtimeId']);
        $this->getJson($this->base.'/browser-runs', $this->key('browserKey'))->assertOk()->assertJsonCount(0, 'runs');
        $this->postJson($this->actionPath().'/handoff', ['generation' => $this->claimed['generation'],
            'origin' => 'https://shop.example.com'], $this->key('browserKey'))->assertStatus(409);
    }
}
