<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Connectors\GithubConnector;
use App\Services\ChatConnectors\Github\Client;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GithubIssueReadTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Client::endBatch();
        Http::preventStrayRequests();
    }

    public function test_issue_body_and_comment_page_are_bounded_and_paged(): void
    {
        $comments = array_fill(0, 10, ['body' => str_repeat('c', 1210),
            'user' => ['login' => 'reviewer'], 'created_at' => '2026-09-01T00:00:00Z']);
        Http::fake([
            'api.github.com/repos/ellis/app/issues/4' => Http::response([
                'number' => 4, 'title' => 'Fix startup', 'body' => str_repeat('b', 4010),
                'comments' => 11, 'labels' => array_fill(0, 11, ['name' => 'bug']),
                'user' => ['login' => 'ellis'], 'state' => 'open'], 200),
            'api.github.com/repos/ellis/app/issues/4/comments?*' => Http::response($comments, 200,
                ['Link' => '<https://api.github.com/repos/ellis/app/issues/4/comments?page=2>; rel="next"']),
        ]);
        $connector = app(GithubConnector::class);
        $safe = $connector->validate('github_issue', ['repository' => 'ellis/app', 'number' => 4]);
        $this->assertSame(1, $safe['page']);
        $outcome = $connector->run('github_issue', $safe, 'fixture-token');
        $result = $outcome['result'];
        $this->assertSame('Read issue #4 on ellis/app', $outcome['summary']);
        $this->assertSame(4000, strlen($result['body']));
        $this->assertTrue($result['bodyTruncated']);
        $this->assertCount(10, $result['labels']);
        $this->assertCount(10, $result['comments']);
        $this->assertSame(1200, strlen($result['comments'][0]['body']));
        $this->assertTrue($result['comments'][0]['bodyTruncated']);
        $this->assertTrue($result['hasMoreComments']);
        $this->assertSame(2, $result['nextPage']);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/issues/4/comments?')
            && str_contains($request->url(), 'per_page=10') && str_contains($request->url(), 'page=1'));
        Http::assertSentCount(2);
    }

    public function test_a_pull_request_number_cannot_masquerade_as_an_issue(): void
    {
        Http::fake(['api.github.com/repos/ellis/app/issues/4' => Http::response([
            'number' => 4, 'title' => 'PR', 'comments' => 2, 'pull_request' => ['url' => 'pulls/4']])]);
        $connector = app(GithubConnector::class);
        $outcome = $connector->run('github_issue', $connector->validate('github_issue',
            ['repository' => 'ellis/app', 'number' => 4]), 'fixture-token');
        $this->assertStringContainsString('pull request', $outcome['result']['error']);
        Http::assertSentCount(1);
    }

    public function test_unreadable_comments_do_not_yield_a_complete_issue(): void
    {
        Http::fake([
            'api.github.com/repos/ellis/app/issues/4' => Http::response([
                'number' => 4, 'title' => 'Fix startup', 'body' => 'Reproduce this.', 'comments' => 1]),
            'api.github.com/repos/ellis/app/issues/4/comments?*' => Http::response([], 403),
        ]);
        $connector = app(GithubConnector::class);
        $outcome = $connector->run('github_issue', $connector->validate('github_issue',
            ['repository' => 'ellis/app', 'number' => 4]), 'fixture-token');
        $this->assertArrayHasKey('error', $outcome['result']);
        $this->assertArrayNotHasKey('body', $outcome['result']);
        $this->assertStringContainsString('Could not read issue #4', $outcome['summary']);
    }
}
