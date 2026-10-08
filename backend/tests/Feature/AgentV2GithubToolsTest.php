<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** GitHub through the V2 broker: explicit repositories, pagination, approved writes, typed outcomes (fixtures). */
class AgentV2GithubToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const REPO = '#api\.github\.com/repos/qa-org/sandbox';
    private string $conn;
    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->conn = $this->providerInstall('github', '@owner', 'gh-token');
    }

    private function start(array $ops): array
    {
        $this->grant($this->conn, $ops);
        $run = $this->admit('Look at the sandbox issues.');
        $this->claimed = $this->claim();
        return $run;
    }

    private function gh(string $tool, array $args, string $callId)
    {
        return $this->callTool($this->claimed, $tool, $this->conn, $args, $callId)->assertOk();
    }

    public function test_reads_name_an_exact_repository_paginate_and_skip_pull_requests_in_issue_lists(): void
    {
        $this->start(['github_list_issues', 'github_list_pull_requests', 'github_list_repositories', 'github_read_file', 'github_read_issue']);
        $this->route('GET', '#api\.github\.com/user/repos#', Http::response([['full_name' => 'qa-org/sandbox', 'private' => true]],
            200, ['Link' => '<https://api.github.com/user/repos?page=2>; rel="next"']));
        $this->route('GET', self::REPO.'/issues\?#', Http::response([['number' => 7, 'title' => 'Plan the sync', 'state' => 'open',
            'html_url' => 'https://github.com/qa-org/sandbox/issues/7'], ['number' => 8, 'title' => 'A PR', 'pull_request' => []]]));
        $this->route('GET', self::REPO.'/pulls#', Http::response([['number' => 8, 'title' => 'A PR', 'draft' => true]]));
        $this->route('GET', self::REPO.'/issues/7$#', Http::response(['number' => 7, 'title' => 'Plan the sync', 'body' => 'Needs a meeting.',
            'comments' => 0, 'html_url' => 'https://github.com/qa-org/sandbox/issues/7']));
        $this->route('GET', self::REPO.'/contents/README\.md#', Http::response(['type' => 'file', 'encoding' => 'base64',
            'size' => 12, 'content' => base64_encode("line one\nline two"), 'sha' => 'abc']));
        $repos = $this->gh('github_list_repositories', [], 'c1'); $repos->assertJsonPath('action.state', 'completed');
        $this->assertSame(['qa-org/sandbox', true, 2], [$repos->json('action.result.repositories.0.fullName'),
            $repos->json('action.result.hasMore'), $repos->json('action.result.nextPage')]);
        $issues = $this->gh('github_list_issues', ['repository' => 'qa-org/sandbox'], 'c2')->json('action.result');
        $this->assertSame([7], array_column($issues['issues'], 'number'), 'Pull requests are not listed as issues.');
        $this->assertFalse($issues['hasMore']);
        $this->gh('github_list_pull_requests', ['repository' => 'qa-org/sandbox', 'state' => 'all'], 'c3')
            ->assertJsonPath('action.result.pullRequests.0.draft', true);
        $this->gh('github_read_issue', ['repository' => 'qa-org/sandbox', 'number' => 7], 'c4')
            ->assertJsonPath('action.result.body', 'Needs a meeting.')
            ->assertJsonPath('action.receipt.providerResourceId', 'qa-org/sandbox#7')
            ->assertJsonPath('action.receipt.url', 'https://github.com/qa-org/sandbox/issues/7');
        $this->gh('github_read_file', ['repository' => 'qa-org/sandbox', 'path' => 'README.md', 'ref' => 'main'], 'c5')
            ->assertJsonPath('action.result.text', "1: line one\n2: line two");
        // No default repository: a call without an exact owner/name is refused before GitHub is asked.
        $this->gh('github_list_issues', [], 'c6')->assertJsonPath('action.state', 'refused')
            ->assertJsonPath('action.result.reason', 'invalid_arguments');
        $this->gh('github_list_issues', ['repository' => 'qa-org/sandbox', 'label' => 'x'], 'c7')
            ->assertJsonPath('action.result.reason', 'invalid_arguments');
    }

    public function test_create_issue_waits_for_exact_approval_and_the_receipt_names_the_issue(): void
    {
        $run = $this->start(['github_create_issue', 'github_read_issue']);
        $this->route('POST', self::REPO.'/issues$#', Http::response(['number' => 12, 'title' => 'Sync meeting',
            'html_url' => 'https://github.com/qa-org/sandbox/issues/12'], 201));
        $action = $this->gh('github_create_issue', ['repository' => 'qa-org/sandbox', 'title' => 'Sync meeting',
            'body' => 'Agenda: calendar sync.'], 'w1')->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->assertSame(0, $this->sent('POST', self::REPO.'#'));
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.receipt.outcome', 'confirmed')
            ->assertJsonPath('action.receipt.providerResourceId', 'qa-org/sandbox#12')
            ->assertJsonPath('action.receipt.url', 'https://github.com/qa-org/sandbox/issues/12');
        $this->decide($action)->assertOk();
        $this->assertSame(1, $this->sent('POST', self::REPO.'/issues$#'), 'A duplicate decision never posts twice.');
        Http::assertSent(fn ($r) => $r->method() === 'POST' && $r->data() === ['title' => 'Sync meeting', 'body' => 'Agenda: calendar sync.']);
        $this->assertSame('running', $this->runState($run['id']));
    }

    public function test_comment_confirms_its_url_and_an_unconfirmed_post_is_unknown_and_never_retried(): void
    {
        $run = $this->start(['github_comment_issue']);
        $this->route('POST', self::REPO.'/issues/7/comments#', Http::response(['id' => 99,
            'html_url' => 'https://github.com/qa-org/sandbox/issues/7#issuecomment-99'], 201));
        $ok = $this->gh('github_comment_issue', ['repository' => 'qa-org/sandbox', 'number' => 7, 'body' => 'Booked.'], 'w1')->json('action');
        $this->decide($ok)->assertJsonPath('action.receipt.providerResourceId', '99')
            ->assertJsonPath('action.receipt.url', 'https://github.com/qa-org/sandbox/issues/7#issuecomment-99');
        $this->route('POST', self::REPO.'/issues/7/comments#', $this->timeout());
        $args = ['repository' => 'qa-org/sandbox', 'number' => 7, 'body' => 'Second note.'];
        $lost = $this->gh('github_comment_issue', $args, 'w2')->json('action');
        $this->decide($lost)->assertOk()->assertJsonPath('action.state', 'unknown')
            ->assertJsonPath('action.receipt.status', 'unknown')->assertJsonPath('action.result.outcome', 'outcome_unknown');
        $this->gh('github_comment_issue', $args, 'w3')->assertJsonPath('action.state', 'refused')
            ->assertJsonPath('action.result.reason', 'outcome_unknown');
        $this->assertSame(2, $this->sent('POST', self::REPO.'/issues/7/comments#'));
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $this->claimed['generation'],
            'answer' => 'The second comment may not have posted.'], $this->runnerHeaders())->assertOk()
            ->assertJsonPath('run.state', 'outcome_unknown');
    }

    public function test_typed_read_outcomes_rate_limit_not_found_retryable_and_reconnect(): void
    {
        $run = $this->start(['github_list_issues', 'github_read_issue']);
        $list = ['repository' => 'qa-org/sandbox'];
        $this->route('GET', self::REPO.'/issues\?#', Http::response(['message' => 'API rate limit exceeded'], 403,
            ['X-RateLimit-Remaining' => '0', 'X-RateLimit-Reset' => (string) (time() + 120)]));
        $limited = $this->gh('github_list_issues', $list, 'r1')->assertJsonPath('action.state', 'failed')
            ->assertJsonPath('action.result.outcome', 'rate_limited')->assertJsonPath('action.result.retryable', true);
        $this->assertGreaterThan(100, $limited->json('action.result.retryAfter'));
        $this->route('GET', self::REPO.'/issues\?#', Http::response(['message' => 'Slow down'], 429, ['Retry-After' => '30']));
        $this->gh('github_list_issues', $list, 'r2')->assertJsonPath('action.result.retryAfter', 30);
        $this->route('GET', self::REPO.'/issues\?#', Http::response(['message' => 'boom'], 502));
        $this->gh('github_list_issues', $list, 'r3')->assertJsonPath('action.result.outcome', 'retryable');
        $this->route('GET', self::REPO.'/issues/5$#', Http::response(['message' => 'Not Found'], 404));
        $this->gh('github_read_issue', $list + ['number' => 5], 'r4')->assertJsonPath('action.result.outcome', 'refused')
            ->assertJsonPath('action.result.reason', 'not_found')->assertJsonPath('action.result.retryable', false);
        $this->assertSame('running', $this->runState($run['id']));
        $this->route('GET', self::REPO.'/issues\?#', Http::response(['message' => 'Bad credentials'], 401));
        $this->gh('github_list_issues', $list, 'r5')->assertJsonPath('action.result.outcome', 'reconnect_required');
        $this->assertSame('waiting_for_signin', $this->runState($run['id']));
    }

    public function test_wrong_target_comment_receipt_is_unknown_and_cannot_be_posted_again(): void
    {
        $this->start(['github_comment_issue']);
        $this->route('POST', self::REPO.'/issues/7/comments$#', Http::response(['id' => 99,
            'html_url' => 'https://github.com/qa-org/sandbox/issues/8#issuecomment-99'], 201));
        $args = ['repository' => 'qa-org/sandbox', 'number' => 7, 'body' => 'Approved comment.'];
        $action = $this->gh('github_comment_issue', $args, 'wrong-target')->json('action');
        $this->assertSame($args, \App\Models\AgentV2\ToolAction::findOrFail($action['id'])->arguments);
        $this->decide($action)->assertJsonPath('action.state', 'unknown')
            ->assertJsonPath('action.result.outcome', 'outcome_unknown');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->gh('github_comment_issue', $args, 'new-call-id')->assertJsonPath('action.state', 'refused')
            ->assertJsonPath('action.result.reason', 'outcome_unknown');
        $this->assertSame(1, $this->sent('POST', self::REPO.'/issues/7/comments$#'));
        Http::assertSent(fn ($r) => $r->method() === 'POST' && $r->hasHeader('Authorization', 'Bearer gh-token')
            && $r->data() === ['body' => 'Approved comment.']);
    }
}
