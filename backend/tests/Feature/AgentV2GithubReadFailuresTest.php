<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\{GithubTools, ToolFailure};
use App\Services\ChatConnectors\Github\Client;
use App\Services\ChatConnectors\ReconnectRequired;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AgentV2GithubReadFailuresTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Client::endBatch();
        Http::preventStrayRequests();
    }

    #[DataProvider('commentFailures')]
    public function test_comment_errors_retain_provider_classification(int $status, array $headers,
        string $outcome, ?int $retryAfter): void
    {
        $this->fakeComments(Http::response(['message' => 'Fixture provider error'], $status, $headers));
        try {
            $this->read();
            $this->fail('The issue cannot be complete when its discussion failed.');
        } catch (ReconnectRequired $failure) {
            $this->assertSame('reconnect_required', $outcome);
        } catch (ToolFailure $failure) {
            $this->assertSame($outcome, $failure->outcome);
            $this->assertSame($retryAfter, $failure->retryAfter);
        }
        Http::assertSentCount(2);
    }

    public static function commentFailures(): array
    {
        return [
            'expired account' => [401, [], 'reconnect_required', null],
            'private repository unavailable' => [404, [], 'refused', null],
            'permission denied' => [403, [], 'refused', null],
            'primary rate limit' => [403, ['X-RateLimit-Remaining' => '0', 'Retry-After' => '120'], 'rate_limited', 120],
            'rate limit' => [429, ['Retry-After' => '30'], 'rate_limited', 30],
            'provider unavailable' => [503, [], 'retryable', null],
        ];
    }

    public function test_secondary_rate_limit_text_is_preserved_without_returning_provider_text(): void
    {
        $this->fakeComments(Http::response(['message' => 'You have exceeded a secondary rate limit.'], 403,
            ['Retry-After' => '45']));
        try { $this->read(); $this->fail('Throttling must surface.'); }
        catch (ToolFailure $failure) {
            $this->assertSame('rate_limited', $failure->outcome);
            $this->assertSame(45, $failure->retryAfter);
        }
    }

    public function test_malformed_json_can_be_retried_instead_of_being_treated_as_an_unsupported_tool(): void
    {
        $this->fakeComments(Http::response('not json', 200));
        try { $this->read(); $this->fail('Malformed data cannot confirm a read.'); }
        catch (ToolFailure $failure) { $this->assertSame('retryable', $failure->outcome); }
    }

    public function test_page_limit_and_filtered_empty_page_do_not_claim_full_coverage(): void
    {
        Http::fake(['api.github.com/repos/qa-org/sandbox/issues*' => Http::response([
            ['number' => 7, 'pull_request' => []]], 200,
            ['Link' => '<https://api.github.com/repos/qa-org/sandbox/issues?page=101>; rel="next"'])]);
        $tools = app(GithubTools::class);
        foreach ([1, 100] as $page) {
            $result = $tools->run('github_list_issues', ['repository' => 'qa-org/sandbox', 'state' => 'open',
                'page' => $page], 'fixture-token', 'read-'.$page)['result'];
            $this->assertSame([], $result['issues']);
            $this->assertTrue($result['hasMore']);
            $this->assertSame($page === 1 ? 2 : null, $result['nextPage']);
            $this->assertStringStartsWith('Partial:', $result['coverage']);
            if ($page === 100) $this->assertStringContainsString('limit was reached', $result['coverage']);
        }
    }

    private function fakeComments(mixed $response): void
    {
        Http::fake([
            'api.github.com/repos/qa-org/sandbox/issues/7' => Http::response([
                'number' => 7, 'title' => 'Fixture', 'body' => 'Discussion', 'comments' => 1]),
            'api.github.com/repos/qa-org/sandbox/issues/7/comments?*' => $response,
        ]);
    }

    private function read(): array
    {
        return app(GithubTools::class)->run('github_read_issue', ['repository' => 'qa-org/sandbox',
            'number' => 7, 'page' => 1], 'fixture-token', 'read-1');
    }
}
