<?php
namespace Tests\Feature\CloudGit;

use Illuminate\Support\Facades\{DB, Http, Log};
use Illuminate\Support\Str;

class GitCredentialTest extends CloudGitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->makeComputer();
        $this->queueProject('octo/hello');
    }
    public function test_only_repos_in_the_computers_project_list_get_a_credential(): void
    {
        $this->connectGithub(); $this->fakeRepo(); $this->fakeRepo([], 'other/secret'); $this->fakeRepo([], 'octo/reported');
        // Reachable by the owner's token, but not on this computer: refused before GitHub is asked.
        foreach (['fetch', 'push'] as $op) {
            $this->credential(['repo' => 'other/secret', 'op' => $op, 'branch' => 'vibyra/x'])->assertStatus(403)
                ->assertJsonPath('code', 'repo_not_in_computer')->assertJsonMissing(['password' => self::TOKEN]);
        }
        Http::assertNothingSent();
        // A failed clone does not make a repo eligible; a pending or done one does; case does not matter.
        $this->queueProject('octo/failed', 'failed');
        $this->credential(['repo' => 'octo/failed', 'op' => 'fetch'])->assertStatus(403)->assertJsonPath('code', 'repo_not_in_computer');
        $this->queueProject('Mixed/Case'); $this->fakeRepo([], 'mixed/case');
        $this->credential(['repo' => 'mixed/case', 'op' => 'fetch'])->assertOk();
        // Host-reported origins count too.
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['host_projects' => json_encode([['name' => 'rep', 'repo' => 'octo/reported', 'branch' => 'main']])]);
        $this->fakeRepo([], 'octo/reported');
        $this->credential(['repo' => 'octo/reported', 'op' => 'push', 'branch' => 'vibyra/t'])->assertOk();
    }
    public function test_a_project_workspace_is_refused_even_for_a_listed_repo(): void
    {
        $this->connectGithub(); $this->fakeRepo();
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['kind' => 'project']);
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertStatus(403)->assertJsonMissing(['password' => self::TOKEN]);
    }
    public function test_the_throttle_is_per_workspace_not_per_ip(): void
    {
        $this->connectGithub(); $this->fakeRepo();
        foreach (range(1, 30) as $i) $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertOk();
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertStatus(429);
        // Same bearer from another IP shares the bucket (the key is the workspace, not the address).
        $this->withServerVariables(['REMOTE_ADDR' => '9.9.9.9'])->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertStatus(429);
    }
    public function test_fetch_and_agent_branch_push_issue_a_token_within_ten_minutes(): void
    {
        $this->connectGithub(); $this->fakeRepo();
        foreach ([['op' => 'fetch'], ['op' => 'push', 'branch' => 'vibyra/fix-login']] as $q) {
            $r = $this->credential(['repo' => 'octo/hello', ...$q])->assertOk();
            $this->assertSame('x-access-token', $r->json('username'));
            $this->assertSame(self::TOKEN, $r->json('password'));
            $this->assertStringContainsString('no-store', $r->headers->get('Cache-Control'));
            $ttl = now()->diffInSeconds(\Illuminate\Support\Carbon::parse($r->json('expiresAt')), false);
            $this->assertTrue($ttl > 0 && $ttl <= 600, 'ttl '.$ttl);
        }
    }
    public function test_push_matrix_refuses_default_non_vibyra_and_protected_branches(): void
    {
        $this->connectGithub(); $this->fakeRepo();
        foreach (['main', 'master', 'default', 'feature/x', 'vibyra', 'vibyra/', 'vibyra/..', 'VIBYRA/x', 'vibyra/a.lock'] as $branch) {
            $this->credential(['repo' => 'octo/hello', 'op' => 'push', 'branch' => $branch])->assertStatus(403)
                ->assertJsonPath('code', 'push_branch_not_allowed')->assertJsonMissing(['password' => self::TOKEN]);
        }
        $this->credential(['repo' => 'octo/hello', 'op' => 'push'])->assertStatus(403)->assertJsonPath('code', 'push_branch_not_allowed');
    }
    public function test_push_to_a_default_branch_named_with_the_prefix_is_still_refused(): void
    {
        $this->connectGithub(); $this->fakeRepo(['default_branch' => 'vibyra/trunk']);
        $this->credential(['repo' => 'octo/hello', 'op' => 'push', 'branch' => 'vibyra/trunk'])->assertStatus(403)
            ->assertJsonPath('code', 'push_default_branch_refused');
    }
    public function test_push_needs_write_permission_but_fetch_does_not(): void
    {
        $this->connectGithub(); $this->fakeRepo(['permissions' => ['push' => false]]);
        $this->credential(['repo' => 'octo/hello', 'op' => 'push', 'branch' => 'vibyra/x'])->assertStatus(403)->assertJsonPath('code', 'push_not_permitted');
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertOk();
    }
    public function test_unconnected_repo_and_missing_github_are_refused(): void
    {
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertStatus(409)->assertJsonPath('code', 'github_not_connected');
        $this->connectGithub(); $this->queueProject('other/secret');
        Http::fake(['api.github.com/repos/other/secret' => Http::response(['message' => 'Not Found'], 404)]);
        $this->credential(['repo' => 'other/secret', 'op' => 'fetch'])->assertStatus(403)->assertJsonPath('code', 'repo_not_connected');
        $this->credential(['repo' => 'other/secret', 'op' => 'push', 'branch' => 'vibyra/x'])->assertStatus(403)->assertJsonPath('code', 'repo_not_connected');
    }
    public function test_validation_and_auth(): void
    {
        $this->connectGithub(); $this->fakeRepo();
        $this->credential(['repo' => '../etc', 'op' => 'fetch'])->assertStatus(422);
        $this->credential(['repo' => 'octo/hello', 'op' => 'delete'])->assertStatus(422);
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'], token: 'wrong-token')->assertStatus(401);
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'], token: 'cloud-test')->assertStatus(401); // a user session is not a runtime token
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'], workspace: (string) Str::uuid())->assertStatus(401);
    }
    public function test_a_runtime_token_cannot_reach_another_workspace(): void
    {
        $this->connectGithub(); $this->fakeRepo();
        $other = $this->imported();
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'], workspace: $other)->assertStatus(401);
    }
    public function test_token_never_reaches_logs_or_other_tables_and_audit_is_metadata(): void
    {
        $this->connectGithub(); $this->fakeRepo();
        $lines = [];
        Log::listen(function ($m) use (&$lines) { $lines[] = $m->message.' '.json_encode($m->context); });
        $this->credential(['repo' => 'octo/hello', 'op' => 'push', 'branch' => 'vibyra/a'])->assertOk();
        $this->credential(['repo' => 'octo/hello', 'op' => 'push', 'branch' => 'main'])->assertStatus(403);
        $audit = array_values(array_filter($lines, fn ($l) => str_contains($l, 'cloud.git.credential')));
        $this->assertCount(2, $audit);
        $this->assertStringNotContainsString(self::TOKEN, implode("\n", $lines));
        foreach (DB::select("select name from sqlite_master where type='table'") as $t) {
            if ($t->name === 'vibes_integration_installs') continue;
            $this->assertStringNotContainsString(self::TOKEN, json_encode(DB::table($t->name)->get()), $t->name);
        }
    }
    public function test_no_other_route_or_source_path_mints_a_push_token(): void
    {
        $uris = collect(app('router')->getRoutes()->getRoutes())->filter(fn ($r) => str_ends_with($r->uri(), 'git/credential'))->map->uri()->all();
        $this->assertSame(['api/cloud-runtime/{workspace}/git/credential'], array_values($uris));
        // Only these files may decrypt the stored GitHub credential; the connector paths stay read/PR-through-API on the server.
        // BranchDelivery uses it server-side for an exact-approved API write and never returns it; Runtime::bootstrap is the pre-existing clone-source path.
        $allowed = ['Services/Agents/BranchPublication/BranchDelivery.php', 'Services/CloudWorkspaces/Git/Repos.php', 'Services/CloudWorkspaces/Runtime.php'];
        $hits = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path()));
        foreach ($it as $f) {
            if (!str_ends_with($f->getPathname(), '.php')) continue;
            $src = file_get_contents($f->getPathname());
            if (preg_match("#credential\([^;]*'github'\)#", $src) && !str_contains($f->getPathname(), 'ChatConnectors')) $hits[] = substr($f->getPathname(), strlen(app_path()) + 1);
        }
        sort($hits);
        $this->assertSame($allowed, $hits, 'A new path reads the stored GitHub token; it must not hand it to a remote.');
    }
}
