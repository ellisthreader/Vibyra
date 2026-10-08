<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\{AccessProjects, AccessProviders};
use Illuminate\Support\Facades\DB;

trait MacConnectSelections
{
    public function test_mac_reconnect_preserves_its_proof_and_choices_until_the_active_host_is_updated(): void
    {
        $this->connect()->assertOk();
        $this->cid = DB::table('cloud_workspaces')->where('user_id', $this->user->id)->value('id');
        $token = $this->computerReady();
        $proof = $this->proven();
        $body = $proof + ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version'),
            'projects' => [['id' => 'new', 'name' => 'New project']], 'accounts' => ['codex' => false]];
        $before = DB::table('cloud_connect_consents')->count();
        $this->postJson('/api/cloud-computer/connect/mac', $body)->assertStatus(409)->assertJsonPath('code', 'cloud_update_required');
        $this->assertSame($before, DB::table('cloud_connect_consents')->count());
        $this->assertSame(0, DB::table('cloud_project_access')->count());
        $this->assertNull(DB::table('remote_identity_challenges')->where('id', $proof['challengeId'])->value('consumed_at'));
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0, 'providerPolicyVersion' => 1])->assertOk();
        $this->postJson('/api/cloud-computer/connect/mac', $body)->assertOk();
    }

    public function test_empty_projects_accepts_only_the_reviewed_accounts_and_never_wakes(): void
    {
        $this->connect(['projects' => [], 'accounts' => ['claude' => false, 'codex' => false, 'github' => false]])
            ->assertOk()->assertJsonPath('connected', true)->assertJsonPath('computer.state', 'stopped');
        $this->getJson('/api/cloud-computer/access')->assertOk()->assertJsonPath('projects', [])
            ->assertJsonPath('providers.claude.enabled', false)->assertJsonPath('providers.codex.enabled', false)
            ->assertJsonPath('integrations.github.enabled', false);
        $this->assertSame(0, DB::table('cloud_project_access')->count());
        $this->assertSame(0, DB::table('cloud_computer_wakes')->count());
    }

    public function test_empty_projects_and_omitted_accounts_keep_existing_restrictions(): void
    {
        app(AccessProjects::class)->decide($this->user->id, [
            ['key' => AccessProjects::key('old'), 'name' => 'Existing choice', 'allowed' => true],
            ['key' => AccessProjects::key('private'), 'name' => 'Private', 'allowed' => false],
        ], 'phone');
        app(AccessProviders::class)->apply($this->user->id, ['claude' => false, 'github' => false]);
        $this->connect(['projects' => []])->assertOk();
        $this->assertSame([AccessProjects::key('old')], app(AccessProjects::class)->allowedKeys($this->user->id));
        $this->getJson('/api/cloud-computer/access')->assertJsonPath('providers.claude.enabled', false)
            ->assertJsonPath('integrations.github.enabled', false);
    }

    public function test_invalid_choices_cannot_consume_the_proof_or_keep_a_partial_agreement(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $proof = $this->proven();
        $body = ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version')] + $proof;
        $invalid = [
            ['accounts' => 'nope'], ['accounts' => ['codex' => 'maybe']], ['accounts' => ['github' => null]],
            ['accounts' => ['unknown' => true]], ['projects' => [['id' => 'x', 'name' => '  ']]],
            ['projects' => [['id' => 'x', 'name' => 'X'], ['id' => 'x', 'name' => 'Other']]],
        ];
        foreach ($invalid as $extra) {
            $this->postJson('/api/cloud-computer/connect/mac', $body + $extra)->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        }
        foreach (['cloud_workspaces', 'cloud_connect_consents', 'cloud_project_access', 'cloud_access_settings'] as $table) {
            $this->assertSame(0, DB::table($table)->where('user_id', $this->user->id)->count(), $table);
        }
        $this->assertNull(DB::table('remote_identity_challenges')->where('id', $proof['challengeId'])->value('consumed_at'));
        $this->postJson('/api/cloud-computer/connect/mac', $body + ['projects' => []])->assertOk();
    }

    public function test_changed_terms_require_the_displayed_version_again_without_spending_the_proof(): void
    {
        $proof = $this->proven();
        $displayed = (int) config('cloud_workspaces.connect_consent_version');
        config(['cloud_workspaces.connect_consent_version' => $displayed + 1]);
        $this->postJson('/api/cloud-computer/connect/mac', $proof + ['accept' => true, 'consentVersion' => $displayed])
            ->assertStatus(409)->assertJsonPath('code', 'consent_outdated')->assertJsonPath('current', $displayed + 1);
        $this->assertSame(0, DB::table('cloud_connect_consents')->count());
        $this->assertNull(DB::table('remote_identity_challenges')->where('id', $proof['challengeId'])->value('consumed_at'));
        $this->postJson('/api/cloud-computer/connect/mac', $proof + ['accept' => true, 'consentVersion' => $displayed + 1])->assertOk();
        $this->assertSame($displayed + 1, (int) DB::table('cloud_connect_consents')->value('version'));
    }

    public function test_a_failed_selection_write_rolls_back_proof_computer_consent_and_grants(): void
    {
        $providers = \Mockery::mock(AccessProviders::class)->makePartial();
        $providers->shouldReceive('apply')->once()->andThrow(new \RuntimeException('Fixture selection write failure'));
        $this->app->instance(AccessProviders::class, $providers);
        $this->withoutExceptionHandling();
        try {
            $this->connect(['projects' => [['id' => 'one', 'name' => 'One']], 'accounts' => ['codex' => false]]);
            $this->fail('A selection write should have failed.');
        } catch (\RuntimeException $e) {
            $this->assertSame('Fixture selection write failure', $e->getMessage());
        }
        foreach (['cloud_workspaces', 'cloud_connect_consents', 'cloud_project_access', 'cloud_access_settings'] as $table) {
            $this->assertSame(0, DB::table($table)->where('user_id', $this->user->id)->count(), $table);
        }
        $this->assertSame(0, DB::table('remote_identity_challenges')->whereNotNull('consumed_at')->count());
    }
}
