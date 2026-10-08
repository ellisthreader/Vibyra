<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\{Steering, Tools\Manifest};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** Compatibility with main's newer, independently gated depth features. */
final class AgentStageTwoDepthCompatibilityTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;
    private const TOKEN = 'ghp_k3Jq8ZxV2mNw7RbT4YcD1sHjL6GpUa0EoI5t';

    protected function setUp(): void { parent::setUp(); $this->bootV2(); }

    public function test_edited_draft_rechecks_secret_confirmation_and_masks_the_editor_response(): void
    {
        config(['agent_depth.secret_guard' => true]);
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_send']);
        $this->admit();
        $run = $this->claim();
        $args = ['to' => 'to@example.com', 'subject' => 'Test', 'body' => 'No secret'];
        $a = $this->callTool($run, 'gmail_send', $connection, $args, 'draft')->assertOk()->json('action');
        $draft = $this->getJson('/api/agents/v2/actions/'.$a['id'].'/draft')->assertOk()->json('draft');
        $changed = $this->patchJson('/api/agents/v2/actions/'.$a['id'].'/draft', ['revision' => 1,
            'fingerprint' => $draft['fingerprint'], 'arguments' => [...$args, 'body' => self::TOKEN]])->assertOk();
        $this->assertStringNotContainsString(self::TOKEN, $changed->getContent());
        $this->assertSame(['github_token'], ToolAction::findOrFail($a['id'])->secret_kinds);
        $this->postJson('/api/agents/v2/actions/'.$a['id'].'/decision', ['decision' => 'allow',
            'fingerprint' => $changed->json('draft.fingerprint')])->assertStatus(422)->assertJsonPath('code', 'secret_confirmation_required');
        Http::assertNothingSent();
    }

    public function test_steering_checkpoint_preserves_secret_redaction(): void
    {
        config(['agent_depth.secret_guard' => true]);
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_send']);
        $this->admit();
        $run = $this->claim();
        $this->callTool($run, 'gmail_send', $connection,
            ['to' => 'to@example.com', 'subject' => 'Test', 'body' => self::TOKEN], 'draft')->assertOk();
        $row = Run::findOrFail($run['id']);
        $row->forceFill(['instruction_revision' => 1])->save();
        $this->assertStringNotContainsString(self::TOKEN, json_encode(Steering::actions($row)));
    }

    public function test_local_outputs_and_delegation_share_the_manifest_cap(): void
    {
        config(['agent_depth.delegation' => true, 'agents_v2.outputs_enabled' => true, 'agents_v2.max_tools' => 3]);
        app(\App\Services\Agents\Teammates::class)->save($this->user->id, ['id' => (string) \Illuminate\Support\Str::uuid(),
            'name' => 'Other', 'brief' => 'Help', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection);
        $run = $this->admit();
        $manifest = app(Manifest::class)->for(Run::findOrFail($run['id']));
        $this->assertSame(['save_output', 'read_output', 'delegate_task'], array_column($manifest['tools'], 'tool'));
    }
}
