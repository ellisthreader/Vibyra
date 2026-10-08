<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\{GithubWrites, ToolFailure};
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Provider fixtures only: a 201 is insufficient without an exact resource receipt. */
class AgentV2GithubReceiptTest extends TestCase
{
    #[DataProvider('invalidReceipts')]
    public function test_uncertain_receipts_are_never_reported_as_completed(string $tool, array $body): void
    {
        Http::preventStrayRequests();
        Http::fake(['api.github.com/repos/qa-org/sandbox/issues*' => Http::response($body, 201)]);
        try {
            app(GithubWrites::class)->run($tool, ['repository' => 'qa-org/sandbox', 'title' => 'Test',
                'number' => 7, 'body' => 'Approved text'], 'fixture-token');
            $this->fail('An invalid receipt must remain uncertain.');
        } catch (ToolFailure $failure) {
            $this->assertSame(ToolFailure::UNKNOWN, $failure->outcome);
        }
        Http::assertSentCount(1);
    }

    public static function invalidReceipts(): array
    {
        $issue = 'github_create_issue'; $comment = 'github_comment_issue';
        $base = 'https://github.com/qa-org/sandbox';
        return [
            'wrong comment issue' => [$comment, ['id' => 99, 'html_url' => $base.'/issues/8#issuecomment-99']],
            'wrong comment PR' => [$comment, ['id' => 99, 'html_url' => $base.'/pull/8#issuecomment-99']],
            'wrong comment id' => [$comment, ['id' => 99, 'html_url' => $base.'/issues/7#issuecomment-98']],
            'nested comment path' => [$comment, ['id' => 99, 'html_url' => $base.'/blob/main/issues/7#issuecomment-99']],
            'nested issue path' => [$issue, ['number' => 12, 'html_url' => $base.'/blob/main/issues/12']],
            'dot segments' => [$issue, ['number' => 12, 'html_url' => $base.'/../../other/project/issues/12']],
            'other repository' => [$issue, ['number' => 12, 'html_url' => 'https://github.com/other/project/issues/12']],
            'wrong host' => [$issue, ['number' => 12, 'html_url' => 'https://github.com.example/qa-org/sandbox/issues/12']],
            'zero issue' => [$issue, ['number' => 0, 'html_url' => $base.'/issues/0']],
            'negative comment' => [$comment, ['id' => -1, 'html_url' => $base.'/issues/7#issuecomment--1']],
            'string issue id' => [$issue, ['number' => '12', 'html_url' => $base.'/issues/12']],
            'query suffix' => [$issue, ['number' => 12, 'html_url' => $base.'/issues/12?next=/issues/12']],
        ];
    }

    #[DataProvider('validReceipts')]
    public function test_exact_issue_and_pull_request_comment_receipts_remain_supported(string $url): void
    {
        Http::preventStrayRequests();
        Http::fake(['api.github.com/repos/qa-org/sandbox/issues/7/comments' => Http::response([
            'id' => 99, 'html_url' => $url], 201)]);
        $result = app(GithubWrites::class)->run('github_comment_issue', ['repository' => 'qa-org/sandbox',
            'number' => 7, 'body' => 'Approved text'], 'fixture-token');
        $this->assertSame('99', $result['resourceId']);
        $this->assertSame($url, $result['url']);
        Http::assertSentCount(1);
    }

    public static function validReceipts(): array
    {
        return [['https://github.com/qa-org/sandbox/issues/7#issuecomment-99'],
            ['https://github.com/qa-org/sandbox/pull/7#issuecomment-99'],
            ['https://github.com/QA-ORG/Sandbox/issues/7#issuecomment-99']];
    }
}
