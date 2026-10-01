<?php
namespace Tests\Feature\CloudGit;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

class GitPullRequestTest extends CloudGitTestCase
{
    private function open(array $over = [])
    {
        return $this->withToken('cloud-test')->postJson('/api/cloud-computer/pull-request',
            ['project' => 'octo/hello', 'branch' => 'vibyra/fix', 'title' => 'Fix login', 'body' => 'Details', ...$over]);
    }
    private function pr(array $over = []): array
    {
        return ['number' => 7, 'html_url' => 'https://github.com/octo/hello/pull/7', 'changed_files' => 3, 'additions' => 40, 'deletions' => 5, 'commits' => 2, ...$over];
    }
    public function test_opens_a_pr_against_the_default_branch_and_returns_the_summary(): void
    {
        $this->connectGithub();
        Http::fake(['api.github.com/repos/octo/hello/pulls' => Http::response($this->pr(), 201),
            'api.github.com/repos/octo/hello' => Http::response(['default_branch' => 'trunk', 'permissions' => ['push' => true]])]);
        $this->open()->assertOk()->assertJson(['ok' => true, 'url' => 'https://github.com/octo/hello/pull/7', 'number' => 7,
            'existing' => false, 'files' => 3, 'additions' => 40, 'deletions' => 5]);
        Http::assertSent(fn (Request $r) => $r->method() === 'POST' && str_ends_with($r->url(), '/pulls')
            && $r['head'] === 'vibyra/fix' && $r['base'] === 'trunk' && $r['title'] === 'Fix login' && $r->hasHeader('Authorization', 'Bearer '.self::TOKEN));
    }
    public function test_an_explicit_base_is_used(): void
    {
        $this->connectGithub();
        Http::fake(['api.github.com/repos/octo/hello/pulls' => Http::response($this->pr(), 201), 'api.github.com/repos/octo/hello' => Http::response(['default_branch' => 'main'])]);
        $this->open(['base' => 'develop'])->assertOk();
        Http::assertSent(fn (Request $r) => $r->method() === 'POST' && $r['base'] === 'develop');
    }
    public function test_an_existing_pr_is_returned(): void
    {
        $this->connectGithub();
        Http::fake(['api.github.com/repos/octo/hello/pulls*' => Http::sequence()
            ->push(['message' => 'Validation Failed', 'errors' => [['message' => 'A pull request already exists for octo:vibyra/fix.']]], 422)
            ->push([$this->pr(['number' => 4, 'html_url' => 'https://github.com/octo/hello/pull/4'])], 200),
            'api.github.com/repos/octo/hello' => Http::response(['default_branch' => 'main'])]);
        $this->open()->assertOk()->assertJson(['number' => 4, 'existing' => true]);
    }
    public function test_no_commits_between_is_a_422(): void
    {
        $this->connectGithub();
        Http::fake(['api.github.com/repos/octo/hello/pulls' => Http::response(['errors' => [['message' => 'No commits between main and vibyra/fix']]], 422),
            'api.github.com/repos/octo/hello' => Http::response(['default_branch' => 'main'])]);
        $this->open()->assertStatus(422)->assertJsonPath('code', 'no_commits');
    }
    public function test_no_github_connection_is_409(): void
    {
        Http::fake();
        $this->open()->assertStatus(409)->assertJsonPath('code', 'github_not_connected');
        Http::assertNothingSent();
    }
    public function test_bad_branches_and_validation_never_reach_github(): void
    {
        $this->connectGithub(); Http::fake();
        $this->open(['branch' => 'main'])->assertStatus(422)->assertJsonPath('code', 'branch_not_allowed');
        $this->open(['branch' => 'feature/x'])->assertStatus(422)->assertJsonPath('code', 'branch_not_allowed');
        $this->open(['branch' => 'vibyra/../x'])->assertStatus(422);
        $this->open(['title' => ''])->assertStatus(422);
        $this->open(['project' => 'just-a-folder'])->assertStatus(422)->assertJsonPath('code', 'project_repo_unknown');
        $this->open(['base' => 'vibyra/fix'])->assertStatus(422);
        Http::assertNothingSent();
    }
    public function test_a_repo_the_account_cannot_reach_is_refused_and_auth_is_required(): void
    {
        $this->connectGithub();
        Http::fake(['api.github.com/repos/other/secret' => Http::response([], 404)]);
        $this->open(['project' => 'other/secret'])->assertStatus(403)->assertJsonPath('code', 'repo_not_connected');
        $this->withToken($this->runtime)->postJson('/api/cloud-computer/pull-request', ['project' => 'octo/hello', 'branch' => 'vibyra/x', 'title' => 't'])->assertStatus(401);
    }
}
