<?php
namespace Tests\Feature\CloudGit;

use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\Feature\CloudWorkspaces\CloudTestCase;

abstract class CloudGitTestCase extends CloudTestCase
{
    protected const APP_TOKEN = 'ghs_fixture_repository_token';
    protected const TOKEN = 'gho_secret_fixture_token';
    protected string $workspace;
    protected string $runtime;

    protected function setUp(): void
    {
        parent::setUp();
        $this->workspace = $this->imported();
        [, $this->runtime] = $this->ready($this->workspace);
    }
    protected function configureApp(): void
    {
        static $pem;
        if (!$pem) openssl_pkey_export(openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]), $pem);
        config(['cloud_workspaces.github_app.app_id' => '123', 'cloud_workspaces.github_app.private_key' => $pem,
            'cloud_workspaces.github_app.push_enabled' => true]);
        Http::fake([
            'api.github.com/repos/*/installation' => Http::response(['id' => 42, 'repository_selection' => 'selected']),
            'api.github.com/app/installations/42/access_tokens' => fn ($request) => Http::response([
                'token' => self::APP_TOKEN, 'expires_at' => now()->addHour()->toIso8601String(),
                'permissions' => $request['permissions'], 'repositories' => [['full_name' => ($request['repositories'][0] === 'case' ? 'mixed/' : 'octo/').$request['repositories'][0]]],
            ]),
        ]);
    }
    protected function connectGithub(): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => 'github',
            'credential' => Crypt::encryptString(self::TOKEN), 'account_label' => 'octocat',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }
    protected function fakeRepo(array $over = [], string $repo = 'octo/hello'): void
    {
        Http::fake(['api.github.com/repos/'.$repo => Http::response(['default_branch' => 'main', 'private' => true,
            'permissions' => ['push' => true], ...$over])]);
    }
    /** The credential route is for a cloud computer only; the fixture workspace becomes one. */
    protected function makeComputer(): void
    {
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['kind' => 'computer']);
    }
    protected function queueProject(string $repo, string $state = 'done', ?string $name = null): void
    {
        DB::table('cloud_computer_projects')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'workspace_id' => $this->workspace,
            'name' => $name ?? 'p'.substr(md5($repo.$state), 0, 8), 'repo' => $repo, 'state' => $state, 'created_at' => now(), 'updated_at' => now()]);
    }
    protected function asRuntime(?string $token = null): static
    {
        return $this->withToken($token ?? $this->runtime);
    }
    protected function credential(array $q, ?string $workspace = null, ?string $token = null)
    {
        return $this->asRuntime($token)->getJson('/api/cloud-runtime/'.($workspace ?? $this->workspace).'/git/credential?'.http_build_query($q));
    }
}
