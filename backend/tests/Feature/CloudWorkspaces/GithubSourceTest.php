<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Services\CloudWorkspaces\{Runtime, Workspaces};
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

class GithubSourceTest extends CloudTestCase
{
    private function connectGithub(): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => 'github',
            'credential' => Crypt::encryptString('gho_secret_fixture'), 'account_label' => 'octocat',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }
    private function createGithub(array $source = ['type' => 'github', 'repo' => 'octo/hello', 'ref' => 'main']): string
    {
        $id = (string) Str::uuid();
        $this->postJson('/api/cloud-workspaces', ['id' => $id, 'name' => 'Hello', 'projectId' => 'p', 'source' => $source])->assertOk();
        return $id;
    }
    private function bootstrap(string $id, int $revision = 0): array
    {
        $this->start($id, $revision);
        DB::table('cloud_workspaces')->where('id', $id)->update(['machine_id' => 'machine']);
        $w = app(Workspaces::class)->owned($this->user->id, $id);
        return app(Runtime::class)->bootstrap($id, Crypt::decryptString($w->bootstrap_secret), 'machine', 1);
    }
    public function test_create_github_is_stopped_at_once_and_reports_source(): void
    {
        $this->connectGithub();
        $id = $this->createGithub();
        $r = $this->getJson('/api/cloud-workspaces/'.$id)->assertOk()->json('workspace');
        $this->assertSame('stopped', $r['state']);
        $this->assertSame(['type' => 'github', 'repo' => 'octo/hello', 'ref' => 'main', 'baseCommit' => null], $r['source']);
        $this->assertSame(['type' => 'upload'], $this->postJson('/api/cloud-workspaces', ['id' => (string) Str::uuid(), 'name' => 'U', 'projectId' => 'u'])->json('workspace.source'));
        $this->assertTrue($this->getJson('/api/cloud-workspaces')->json('github.connected'));
        $this->assertStringNotContainsString('gho_secret_fixture', $this->getJson('/api/cloud-workspaces')->getContent());
    }
    public function test_repo_and_ref_validation(): void
    {
        $this->connectGithub();
        foreach (['nope', 'a/b/c', '../x', 'a/'] as $repo) {
            $this->postJson('/api/cloud-workspaces', ['id' => (string) Str::uuid(), 'name' => 'x', 'projectId' => 'p', 'source' => ['type' => 'github', 'repo' => $repo]])->assertStatus(422);
        }
        $this->postJson('/api/cloud-workspaces', ['id' => (string) Str::uuid(), 'name' => 'x', 'projectId' => 'p', 'source' => ['type' => 'github', 'repo' => 'a/b', 'ref' => '--upload-pack=x']])->assertStatus(422);
        $this->postJson('/api/cloud-workspaces', ['id' => (string) Str::uuid(), 'name' => 'x', 'projectId' => 'p', 'source' => ['type' => 'gitlab', 'repo' => 'a/b']])->assertStatus(422);
    }
    public function test_not_connected_is_a_409_with_code(): void
    {
        $this->assertFalse($this->getJson('/api/cloud-workspaces')->json('github.connected'));
        $this->postJson('/api/cloud-workspaces', ['id' => (string) Str::uuid(), 'name' => 'x', 'projectId' => 'p', 'source' => ['type' => 'github', 'repo' => 'a/b']])
            ->assertStatus(409)->assertJson(['code' => 'github_not_connected']);
        $this->assertSame(0, DB::table('cloud_workspaces')->count());
    }
    public function test_bootstrap_returns_token_only_for_github_workspaces(): void
    {
        $this->connectGithub();
        $boot = $this->bootstrap($this->createGithub());
        $this->assertSame(['type' => 'github', 'repo' => 'octo/hello', 'ref' => 'main', 'baseCommit' => null, 'token' => 'gho_secret_fixture'], $boot['source']);
        $this->assertSame(['files' => [], 'base' => []], $boot['project']);
    }
    public function test_upload_bootstrap_has_no_token_even_when_github_is_connected(): void
    {
        $this->connectGithub();
        $upload = $this->bootstrap($this->imported(), 1);
        $this->assertSame(['type' => 'upload'], $upload['source']);
        $this->assertStringNotContainsString('gho_secret_fixture', json_encode($upload));
    }
    public function test_token_is_never_stored_or_returned_elsewhere(): void
    {
        $this->connectGithub();
        $id = $this->createGithub(); $this->bootstrap($id);
        $this->assertStringNotContainsString('gho_secret_fixture', json_encode(DB::table('cloud_workspaces')->where('id', $id)->first()));
        $this->assertStringNotContainsString('gho_secret_fixture', $this->getJson('/api/cloud-workspaces/'.$id)->getContent());
        $this->assertStringNotContainsString('gho_secret_fixture', $this->getJson('/api/cloud-workspaces/'.$id.'/export')->getContent());
    }
    public function test_first_checkpoint_makes_it_ready_and_export_has_the_contract_shape(): void
    {
        $this->connectGithub();
        $id = $this->createGithub(); $boot = $this->bootstrap($id);
        $runtime = app(Runtime::class); $w = $runtime->authenticate($id, $boot['token']);
        try { $runtime->heartbeat($w, true); $this->fail('ready without a checkpoint'); } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
        $sha = str_repeat('c', 40);
        $runtime->checkpoint($w, [], [], $sha);
        $this->assertSame('ready', $runtime->heartbeat($runtime->authenticate($id, $boot['token']), true)['state']);
        $this->assertSame($sha, app(Workspaces::class)->owned($this->user->id, $id)->base_commit);
        $export = $this->getJson('/api/cloud-workspaces/'.$id.'/export')->assertOk();
        $this->assertSame([], $export->json('current.files')); $this->assertSame([], $export->json('base.files'));
        $this->assertSame($sha, $export->json('workspace.source.baseCommit'));
        // A changed file, a new file and a deletion (base only).
        $file = fn ($p, $c) => ['path' => $p, 'content' => base64_encode($c), 'sha256' => hash('sha256', $c)];
        $runtime->checkpoint($w, [$file('a.txt', 'new'), $file('added.txt', 'x')], [$file('a.txt', 'old'), $file('gone.txt', 'bye')], $sha);
        $export = $this->getJson('/api/cloud-workspaces/'.$id.'/export')->assertOk();
        $this->assertSame(['a.txt', 'added.txt'], array_column($export->json('current.files'), 'path'));
        $this->assertSame(['a.txt', 'gone.txt'], array_column($export->json('base.files'), 'path'));
        $this->assertSame(1, $export->json('current.version'));
        try { $runtime->checkpoint($w, [], [], str_repeat('d', 40)); $this->fail('base commit must not change'); } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
    }
    public function test_stopped_github_workspace_can_be_quoted_without_a_checkpoint(): void
    {
        $this->connectGithub();
        $id = $this->createGithub();
        $this->postJson('/api/cloud-workspaces/'.$id.'/quote', ['revision' => 0, 'deviceId' => $this->device->uuid,
            'model' => 'test/model', 'budgetUnits' => 500000, 'seconds' => 3600, 'canWrite' => true, 'commands' => []])->assertOk();
    }
}
