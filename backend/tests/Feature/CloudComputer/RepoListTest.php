<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\{Crypt, DB, Http};

class RepoListTest extends ComputerTestCase
{
    private function connect(): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => 'github',
            'credential' => Crypt::encryptString('gho_secret_fixture_token'), 'account_label' => 'octocat',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }
    private function fakeGithub(array $stubs): void
    {
        // The base fixture fakes every URL first; start from a clean factory so these stubs win.
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake($stubs);
    }
    private function repo(string $name, bool $private = false): array
    {
        return ['full_name' => $name, 'private' => $private, 'default_branch' => 'main', 'description' => 'd '.$name, 'owner' => ['login' => 'x'], 'html_url' => 'https://x'];
    }

    public function test_lists_filtered_repos_without_leaking_anything_else(): void
    {
        $this->connect();
        $this->fakeGithub(['api.github.com/user/repos*' => Http::response([$this->repo('me/api', true), $this->repo('me/web'), $this->repo('org/Api-Tools'), ['full_name' => 'bad name/x']])]);
        $r = $this->getJson('/api/cloud-computer/repos?q=api')->assertOk();
        $this->assertSame(['me/api', 'org/Api-Tools'], array_column($r->json('repos'), 'fullName'));
        $this->assertSame(['fullName', 'private', 'defaultBranch', 'description'], array_keys($r->json('repos.0')));
        $this->assertTrue($r->json('repos.0.private'));
        $this->assertStringNotContainsString('gho_secret', $r->getContent());
        Http::assertSent(fn ($req) => $req->hasHeader('Authorization', 'Bearer gho_secret_fixture_token'));
    }

    public function test_caps_at_thirty_and_requires_a_connection_and_a_bearer(): void
    {
        $this->getJson('/api/cloud-computer/repos')->assertStatus(409)->assertJson(['ok' => false, 'code' => 'github_not_connected']);
        $this->connect();
        $this->fakeGithub(['api.github.com/user/repos*' => Http::response(array_map(fn ($i) => $this->repo("me/r$i"), range(1, 100)))]);
        $this->getJson('/api/cloud-computer/repos')->assertOk()->assertJsonCount(30, 'repos');
        $this->withToken('')->getJson('/api/cloud-computer/repos')->assertStatus(401);
    }

    public function test_expired_github_token_and_outage_are_reported(): void
    {
        $this->connect();
        $this->fakeGithub(['api.github.com/user/repos*' => Http::response([], 401)]);
        $this->getJson('/api/cloud-computer/repos')->assertStatus(409)->assertJson(['code' => 'github_reconnect']);
        $this->fakeGithub(['api.github.com/user/repos*' => Http::response([], 500)]);
        $this->getJson('/api/cloud-computer/repos')->assertStatus(503)->assertJson(['code' => 'github_unavailable']);
    }
}
