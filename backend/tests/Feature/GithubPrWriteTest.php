<?php

namespace Tests\Feature;

use App\Services\Agents\ToolPolicy;
use App\Services\ChatConnectors\{Catalogue, Registry};
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GithubPrWriteTest extends TestCase
{
    private const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    private const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    private function args(): array
    {
        return ['repository' => 'fixture/repo', 'head' => 'vibyra-agent/fix', 'base' => 'main',
            'expectedHeadSha' => self::HEAD, 'expectedBaseSha' => self::BASE,
            'title' => 'Fix login', 'body' => 'Focused regression test included.', 'draft' => true];
    }

    private function connector(): object
    {
        return app(Registry::class)->for('github');
    }

    private function fakeGithub(?string $headSha = null, ?string $baseSha = null, ?array $pr = null): void
    {
        Http::preventStrayRequests();
        Http::fake(function ($request) use ($headSha, $baseSha, $pr) {
            $url = $request->url();
            if (str_ends_with($url, '/git/ref/heads/vibyra-agent/fix')) return Http::response([
                'ref' => 'refs/heads/vibyra-agent/fix', 'object' => ['type' => 'commit', 'sha' => $headSha ?? self::HEAD]]);
            if (str_ends_with($url, '/git/ref/heads/main')) return Http::response([
                'ref' => 'refs/heads/main', 'object' => ['type' => 'commit', 'sha' => $baseSha ?? self::BASE]]);
            if ($request->method() === 'POST' && str_ends_with($url, '/pulls')) return Http::response($pr ?? [
                'number' => 12, 'title' => 'Fix login', 'body' => 'Focused regression test included.', 'draft' => true,
                'html_url' => 'https://github.com/fixture/repo/pull/12',
                'head' => ['ref' => 'vibyra-agent/fix', 'sha' => self::HEAD, 'repo' => ['full_name' => 'fixture/repo']],
                'base' => ['ref' => 'main', 'sha' => self::BASE, 'repo' => ['full_name' => 'fixture/repo']],
            ], 201);
            return Http::response([], 404);
        });
    }

    public function test_pr_write_is_not_offered_until_enabled(): void
    {
        $names = array_column(array_column($this->connector()->definitions(), 'function'), 'name');
        $this->assertNotContains('github_create_pull_request', $names);
        $this->assertNotContains('github_create_pull_request', $this->connector()->writes());
        try { app(ToolPolicy::class)->requiresApproval('github', 'github_create_pull_request'); $this->fail(); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        config(['agents.github_pr_enabled' => true]);
        $names = array_column(array_column($this->connector()->definitions(), 'function'), 'name');
        $this->assertContains('github_create_pull_request', $names);
        $this->assertTrue(app(ToolPolicy::class)->requiresApproval('github', 'github_create_pull_request'));
        $catalogue = app(Catalogue::class)->payload(null)['integrations'];
        $github = collect($catalogue)->firstWhere('id', 'github');
        $this->assertStringContainsString('pull requests', $github['writes']);
    }

    public function test_exact_pr_request_preflights_both_refs_then_posts_once(): void
    {
        config(['agents.github_pr_enabled' => true]);
        $this->fakeGithub();
        $args = $this->connector()->validate('github_create_pull_request', $this->args());
        $result = $this->connector()->run('github_create_pull_request', $args, 'fixture-token')['result'];
        $this->assertTrue($result['opened']);
        $this->assertSame(12, $result['number']);
        $this->assertSame(self::HEAD, $result['headSha']);
        $requests = Http::recorded()->map(fn ($row) => $row[0]);
        $this->assertSame(['GET', 'GET', 'POST'], $requests->map(fn ($r) => $r->method())->all());
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r->url() === 'https://api.github.com/repos/fixture/repo/pulls'
            && $r->data() === ['title' => 'Fix login', 'head' => 'vibyra-agent/fix', 'base' => 'main',
                'body' => 'Focused regression test included.', 'draft' => true]);
        $this->assertSame(1, $requests->filter(fn ($r) => $r->method() === 'POST')->count());
    }

    public function test_moved_branch_refuses_before_post(): void
    {
        config(['agents.github_pr_enabled' => true]);
        $this->fakeGithub(str_repeat('c', 40));
        $args = $this->connector()->validate('github_create_pull_request', $this->args());
        $result = $this->connector()->run('github_create_pull_request', $args, 'fixture-token')['result'];
        $this->assertTrue($result['refused']);
        $this->assertFalse($result['opened']);
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_unconfirmed_response_stays_unknown_even_if_post_succeeded(): void
    {
        config(['agents.github_pr_enabled' => true]);
        $this->fakeGithub(pr: ['number' => 12, 'html_url' => 'https://github.com/fixture/repo/pull/12',
            'title' => 'Fix login', 'body' => 'Focused regression test included.', 'draft' => true,
            'head' => ['ref' => 'vibyra-agent/fix', 'sha' => str_repeat('c', 40), 'repo' => ['full_name' => 'fixture/repo']],
            'base' => ['ref' => 'main', 'sha' => self::BASE, 'repo' => ['full_name' => 'fixture/repo']]]);
        $args = $this->connector()->validate('github_create_pull_request', $this->args());
        $result = $this->connector()->run('github_create_pull_request', $args, 'fixture-token')['result'];
        $this->assertArrayHasKey('error', $result);
        $this->assertSame('https://github.com/fixture/repo/pull/12', $result['url']);
        $this->assertSame(1, Http::recorded(fn ($r) => $r->method() === 'POST')->count());
    }

    public function test_network_loss_after_post_is_unknown_without_retry(): void
    {
        config(['agents.github_pr_enabled' => true]);
        Http::preventStrayRequests();
        $posts = 0;
        Http::fake(function ($request) use (&$posts) {
            if ($request->method() === 'POST') {
                $posts++;
                throw new ConnectionException('fixture disconnect');
            }
            $branch = str_ends_with($request->url(), '/main') ? 'main' : 'vibyra-agent/fix';
            return Http::response(['ref' => 'refs/heads/'.$branch, 'object' => ['type' => 'commit',
                'sha' => $branch === 'main' ? self::BASE : self::HEAD]]);
        });
        $args = $this->connector()->validate('github_create_pull_request', $this->args());
        $result = $this->connector()->run('github_create_pull_request', $args, 'fixture-token')['result'];
        $this->assertArrayHasKey('error', $result);
        $this->assertSame(1, $posts);
    }

    public function test_pr_validation_rejects_ambiguous_or_expanded_authority(): void
    {
        config(['agents.github_pr_enabled' => true]);
        foreach ([
            ['repository' => '../repo'], ['head' => 'other:branch'], ['head' => 'main'],
            ['expectedHeadSha' => 'short'], ['draft' => 'true'], ['extra' => 'push'],
        ] as $change) {
            $args = array_replace($this->args(), $change);
            try { $this->connector()->validate('github_create_pull_request', $args); $this->fail(json_encode($change)); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                $this->assertSame(422, $e->getStatusCode());
            }
        }
    }
}
