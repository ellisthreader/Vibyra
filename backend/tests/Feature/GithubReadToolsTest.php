<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Github\{ReadTools, PullRequests, Activity, Files};
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GithubReadToolsTest extends TestCase
{
    public function test_pr_evidence_keeps_missing_checks_and_partial_patches_explicit(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'api.github.com/repos/owner/app/pulls/4' => Http::response(['head' => ['sha' => 'abc'], 'base' => ['sha' => 'def'], 'changed_files' => 11]),
            'api.github.com/repos/owner/app/pulls/4/reviews*' => Http::response([['state' => 'APPROVED', 'commit_id' => 'old']]),
            'api.github.com/repos/owner/app/commits/abc/check-runs*' => Http::response([], 403),
            'api.github.com/repos/owner/app/commits/abc/status*' => Http::response(['state' => 'pending', 'statuses' => []]),
            'api.github.com/repos/owner/app/pulls/4/files*' => Http::response([
                ['filename' => 'image.png'], ['filename' => 'test.ts', 'patch' => str_repeat('x', 3000)],
            ], 200, ['Link' => '<https://api.github.com/next>; rel="next"']),
        ]);
        $a = ['repository' => 'owner/app', 'number' => 4, 'page' => 1];
        $pr = app(PullRequests::class)->read($a, 'fixture');
        $this->assertSame('abc', $pr['headSha']);
        $this->assertSame(403, $pr['checks']['status']);
        $this->assertSame('old', $pr['reviews']['items'][0]['commitSha']);
        $files = app(PullRequests::class)->files($a, 'fixture');
        $this->assertSame(2, $files['nextPage']);
        $this->assertTrue($files['files'][0]['patchMissing']);
        $this->assertTrue($files['files'][1]['patchTruncated']);
        $this->assertSame(2400, strlen($files['files'][1]['patch']));
    }

    public function test_activity_uses_merge_dates_and_utc_window_not_pr_updated_dates(): void
    {
        Http::fake([
            'api.github.com/repos/*' => Http::response([['sha' => 'abc', 'html_url' => 'https://github.com/o/r/commit/abc']]),
            'api.github.com/search/issues*' => Http::response(['items' => [], 'total_count' => 40, 'incomplete_results' => true],
                200, ['Link' => '<https://api.github.com/next>; rel="next"']),
        ]);
        $a = ReadTools::validate('github_repository_activity', ['repository' => 'o/r', 'since' => '2026-09-06', 'until' => '2026-09-12', 'branch' => 'main']);
        $r = app(Activity::class)->read($a, 'fixture');
        $this->assertSame(2, $r['nextPage']);
        $this->assertTrue($r['mergedPullRequests']['incomplete']);
        Http::assertSent(fn ($r) => ($r['since'] ?? null) === '2026-09-06T00:00:00Z' && $r['until'] === '2026-09-12T23:59:59Z' && $r['sha'] === 'main');
        Http::assertSent(fn ($r) => ($r['q'] ?? null) === 'repo:o/r is:pr is:merged merged:2026-09-06..2026-09-12');
    }

    public function test_file_lines_are_bounded_and_pinned_to_the_requested_reference(): void
    {
        Http::fake(['api.github.com/repos/*' => Http::response(['type' => 'file', 'encoding' => 'base64',
            'content' => base64_encode(implode("\n", range(1, 150))), 'sha' => 'blob'])]);
        $a = ReadTools::validate('github_read_file', ['repository' => 'o/r', 'path' => 'tests/a b.ts', 'ref' => 'head-sha', 'startLine' => 2]);
        $r = app(Files::class)->read($a, 'fixture');
        $this->assertSame(102, $r['nextLine']);
        $this->assertStringStartsWith('2: 2', $r['text']);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/tests/a%20b.ts?ref=head-sha'));
    }

    public function test_invalid_dates_and_secret_or_traversal_paths_are_rejected_before_http(): void
    {
        Http::fake();
        $cases = [
            ['github_repository_activity', ['since' => '2026-02-30']],
            ['github_repository_activity', ['since' => '2026-09-12', 'until' => '2026-09-01']],
            ['github_pull_request', ['number' => '4']],
            ['github_read_file', ['path' => '../secret', 'ref' => 'main']],
            ['github_read_file', ['path' => '.env.production', 'ref' => 'main']],
            ['github_read_file', ['path' => 'key.pem', 'ref' => 'main']],
        ];
        foreach ($cases as [$op, $args]) {
            try { ReadTools::validate($op, ['repository' => 'o/r'] + $args); $this->fail('Accepted unsafe input'); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        }
        Http::assertNothingSent();
    }
}
