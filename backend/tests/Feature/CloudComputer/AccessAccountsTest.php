<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\{Crypt, DB, Storage};

/** Which AI accounts and integrations Vibyra Cloud may use (docs/cloud-access-contract.md, "Accounts"). */
class AccessAccountsTest extends SyncTestCase
{
    private function access(string $method = 'get', string $path = '', array $body = []): \Illuminate\Testing\TestResponse
    {
        return $this->withToken('cloud-test')->{$method.'Json'}('/api/cloud-computer/access'.$path, $body);
    }

    private function freshConnect(array $body): \Illuminate\Testing\TestResponse
    {
        config(['cloud_workspaces.connect_requires_face' => false]);
        DB::table('cloud_connect_consents')->delete();
        return $this->postJson('/api/cloud-computer/connect', ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version')] + $body);
    }

    public function test_everything_is_on_by_default_in_the_access_payload(): void
    {
        $r = $this->access()->assertOk()->json();
        $this->assertSame(['enabled' => true, 'carryOver' => 'unsupported', 'cloudLogin' => ['appliedAt' => null, 'pending' => false]], $r['providers']['claude']);
        $this->assertSame([true, 'allowed'], [$r['providers']['codex']['enabled'], $r['providers']['codex']['carryOver']]);
        $this->assertSame(['github' => ['enabled' => true]], $r['integrations']);
    }

    public function test_connect_stores_the_ticked_accounts_and_codex_off_blocks_carry_over(): void
    {
        $this->freshConnect(['accounts' => ['claude' => false, 'codex' => false, 'github' => false]])->assertOk();
        $r = $this->access()->json();
        $this->assertSame([false, false, 'blocked', false],
            [$r['providers']['claude']['enabled'], $r['providers']['codex']['enabled'], $r['providers']['codex']['carryOver'], $r['integrations']['github']['enabled']]);
        $this->assertSame('blocked', $this->sync('get', '/')->json('access.codexCarryOver'));
        // Codex back on leaves the carry-over as it was.
        $this->freshConnect(['accounts' => ['codex' => true]])->assertOk();
        $r = $this->access()->json();
        $this->assertSame([false, true, 'blocked'], [$r['providers']['claude']['enabled'], $r['providers']['codex']['enabled'], $r['providers']['codex']['carryOver']]);
    }

    public function test_connect_refuses_bad_accounts_before_anything_is_kept(): void
    {
        foreach ([['accounts' => 'nope'], ['accounts' => ['claude' => 'maybe']], ['accounts' => ['github' => [1]]], ['accounts' => ['unknown' => false]], ['accounts' => ['codex' => null]]] as $extra) {
            $this->freshConnect($extra)->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        }
        $this->assertSame([0, 0], [DB::table('cloud_connect_consents')->count(), DB::table('cloud_access_settings')->count()]);
        $this->freshConnect(['accounts' => ['claude' => true]])->assertOk();
        $this->assertTrue($this->access()->json('providers.claude.enabled'));
    }

    public function test_the_puts_switch_each_one_and_need_the_agreement(): void
    {
        $this->access('put', '/providers/claude', ['enabled' => false])->assertOk()->assertJsonPath('providers.claude.enabled', false);
        $this->access('put', '/providers/claude', ['enabled' => 'sideways'])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->access('put', '/providers/claude', [])->assertStatus(422);
        $this->access('put', '/providers/codex', [])->assertStatus(422);
        $this->access('put', '/providers/codex', ['enabled' => false])->assertOk()
            ->assertJsonPath('providers.codex.enabled', false)->assertJsonPath('providers.codex.carryOver', 'blocked');
        $this->access('put', '/providers/codex', ['enabled' => true])->assertOk()->assertJsonPath('providers.codex.enabled', true);
        $this->access('put', '/providers/codex', ['carryOver' => 'allowed'])->assertOk()->assertJsonPath('providers.codex.carryOver', 'allowed');
        $this->access('put', '/integrations/github', ['enabled' => false])->assertOk()->assertJsonPath('integrations.github.enabled', false);
        $this->access('put', '/integrations/github', ['enabled' => true])->assertOk()->assertJsonPath('integrations.github.enabled', true);
        $this->assertContains($this->access('put', '/providers/gemini', ['enabled' => false])->status(), [404, 405]); // no such switch
        DB::table('cloud_connect_consents')->update(['revoked_at' => now()]);
        $this->access('put', '/providers/claude', ['enabled' => true])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->access('put', '/integrations/github', ['enabled' => false])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->assertFalse($this->access()->json('providers.claude.enabled'));
    }

    public function test_codex_off_drops_and_refuses_its_login(): void
    {
        $content = 'FIXTURE-SEALED-LOGIN';
        $send = fn (int $seq) => $this->raw('PUT', '/api/cloud-computer/sync/login/codex?'.http_build_query(['seq' => $seq, 'sha256' => hash('sha256', $content)]), $content, 'cloud-test');
        $send(1)->assertOk();
        $this->access('put', '/providers/codex', ['enabled' => false])->assertOk();
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $send(2)->assertStatus(409)->assertJsonPath('code', 'login_blocked');
        // Carry-over allowed again while Codex stays off: still refused.
        $this->access('put', '/providers/codex', ['carryOver' => 'allowed'])->assertOk();
        $send(2)->assertStatus(409)->assertJsonPath('code', 'login_blocked');
    }

    public function test_the_host_activity_reply_names_the_turned_off_agents(): void
    {
        $token = $this->computerReady();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0, 'providerPolicyVersion' => 1])->assertOk()->assertExactJson(['ok' => true, 'disabledProviders' => []]);
        $this->access('put', '/providers/claude', ['enabled' => false])->assertOk();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0, 'providerPolicyVersion' => 1])->assertJsonPath('disabledProviders', ['claude']);
        $this->access('put', '/providers/codex', ['enabled' => false])->assertOk();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0])->assertJsonPath('disabledProviders', ['claude', 'codex']);
    }

    public function test_github_off_refuses_the_repo_list_and_repo_projects(): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => 'github',
            'credential' => Crypt::encryptString('gho_secret_fixture_token'), 'account_label' => 'octocat',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->createComputer();
        $this->access('put', '/integrations/github', ['enabled' => false])->assertOk();
        $this->getJson('/api/cloud-computer/repos')->assertStatus(403)
            ->assertJson(['ok' => false, 'code' => 'github_disabled', 'error' => 'GitHub is turned off for Vibyra Cloud. Turn it on in Cloud settings.']);
        $this->postJson('/api/cloud-computer/projects', ['name' => 'app', 'repo' => 'me/app'])->assertStatus(403)->assertJsonPath('code', 'github_disabled');
        $this->assertSame(0, DB::table('cloud_computer_projects')->count());
        // A plain folder needs no GitHub.
        $this->postJson('/api/cloud-computer/projects', ['name' => 'scratch'])->assertOk();
    }
}
