<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Phase 8: POST /runs/preview (task plan card) and the runtime_required fix. */
class AgentV2TaskPlanTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function preview(string $prompt)
    {
        return $this->postJson('/api/agents/v2/runs/preview', ['agentId' => $this->agent['id'],
            'idempotencyKey' => 'send-preview-1', 'prompt' => $prompt]);
    }

    public function test_the_plan_names_accounts_tools_approvals_and_fixable_gaps_without_admitting(): void
    {
        $gmail = $this->gmailInstall('me@example.com');
        $this->grant($gmail, ['gmail_read', 'gmail_search', 'gmail_send']);
        $calendar = $this->providerInstall('google_calendar', 'me@example.com', 'cal-token');
        $plan = $this->preview('Check GitHub for new issues, look at my Google Calendar, then email a summary with Gmail.')
            ->assertOk()->json('plan');
        $this->assertSame('connected_account', $plan['fundingSource']);
        $this->assertTrue($plan['runtime']['ok']);
        $this->assertSame([['provider' => 'gmail', 'name' => $plan['services'][0]['name'], 'connectionId' => $gmail,
            'account' => 'me@example.com', 'score' => $plan['services'][0]['score'], 'reads' => ['gmail_search', 'gmail_read'],
            'writes' => ['gmail_send']]], $plan['services']);
        $this->assertSame(['gmail_send'], array_column($plan['approvals'], 'tool'));
        $this->assertTrue($plan['approvals'][0]['requiresApproval']);
        $missing = collect($plan['missing'])->keyBy('provider');
        $this->assertSame('not_connected', $missing['github']['reason']);
        $this->assertSame('/api/agents/v2/connections/github/start', $missing['github']['fix']['path']);
        $this->assertSame('not_granted', $missing['google_calendar']['reason']);
        $this->assertSame('PUT', $missing['google_calendar']['fix']['method']);
        $this->assertSame('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$calendar, $missing['google_calendar']['fix']['path']);
        $this->assertFalse($plan['ready'], 'A named service that cannot be used blocks the plan.');
        $this->assertSame(0, DB::table('agent_runs')->count(), 'A preview never admits a run.');
        $this->assertSame(0, DB::table('agent_grants')->where('connection_id', $calendar)->count(), 'Suggestions never grant.');
        Http::assertNothingSent();
    }

    public function test_a_plan_with_everything_granted_is_ready_and_names_reconnects(): void
    {
        $gmail = $this->gmailInstall('me@example.com');
        $this->grant($gmail);
        $github = $this->providerInstall('github', 'octocat', 'gh-token');
        $this->grant($github, ['github_list_issues']);
        DB::table('agent_connections')->where('id', $github)->update(['health' => 'reconnect_required']);
        $plan = $this->preview('Summarize unread Gmail.')->assertOk()->json('plan');
        $this->assertTrue($plan['ready']);
        $this->assertSame(['gmail_search', 'gmail_read'], array_column($plan['tools'], 'tool'));
        $this->assertSame([], $plan['approvals']);
        $this->assertSame(['reconnect_required'], array_column($plan['missing'], 'reason'));
        $this->assertFalse($plan['missing'][0]['blocking']);
        $this->assertSame('reconnect', $plan['missing'][0]['fix']['action']);
    }

    public function test_without_a_selected_ai_account_preview_and_admission_explain_the_fix(): void
    {
        $this->deleteJson('/api/agents/v2/runtimes/'.$this->runtime['id'])->assertOk();
        $plan = $this->preview('Hello')->assertOk()->json('plan');
        $this->assertFalse($plan['runtime']['ok']);
        $this->assertSame('runtime_required', $plan['runtime']['code']);
        $this->assertSame('choose_ai_account', $plan['runtime']['fix']['action']);
        $this->assertFalse($plan['ready']);
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-12345678',
            'prompt' => 'Hello'])->assertStatus(409)->assertJsonPath('code', 'runtime_required')
            ->assertJsonPath('fix.action', 'choose_ai_account')
            ->assertJsonPath('fix.message', 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.');
    }

    public function test_preview_refuses_unknown_teammates_and_blank_prompts(): void
    {
        $this->postJson('/api/agents/v2/runs/preview', ['agentId' => '00000000-0000-4000-8000-000000000000',
            'idempotencyKey' => 'send-preview-1', 'prompt' => 'x'])->assertStatus(404)->assertJsonPath('code', 'agent_not_found');
        $this->preview('   ')->assertStatus(422);
    }
}
