<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Tests\Support\ShipGithub as G;

class WorktreeShipStatusTest extends WorktreeShipTestCase
{
    private function read(): \Illuminate\Testing\TestResponse
    {
        return $this->getJson('/api/connectors/github/ship/status?repository=fixture/repo&branch=vibyra/task');
    }

    public function test_no_pull_request_yet_says_so_and_names_the_default_branch(): void
    {
        $fake = G::install(['list' => [200, []]]);
        $this->read()->assertOk()->assertJson(['ok' => true, 'defaultBranch' => 'main', 'pullRequest' => null, 'checks' => null]);
        $this->assertSame(['GET /repos/fixture/repo', 'GET /repos/fixture/repo/pulls'], $fake->calls);
    }

    public function test_an_open_pull_request_reports_checks_reviews_and_the_head_to_merge(): void
    {
        G::install();
        $r = $this->read()->assertOk();
        $r->assertJson(['pullRequest' => ['number' => 7, 'state' => 'open', 'draft' => false, 'headSha' => G::HEAD, 'baseRef' => 'main',
            'conflicts' => false], 'checks' => ['state' => 'passing', 'total' => 1, 'failing' => 0],
            'review' => ['decision' => 'APPROVED', 'unresolvedThreads' => 1]]);
        $this->assertStringContainsString('not proof of test coverage', $r->json('coverage'));
    }

    public function test_pending_failing_mixed_and_absent_checks_are_distinct_states(): void
    {
        $cases = [
            'none' => ['none', [], ['state' => 'pending', 'statuses' => []]],
            'pending' => ['pending', [G::run('ci', 'in_progress', null)], ['state' => 'pending', 'statuses' => []]],
            'failing' => ['failing', [G::run('ci', 'completed', 'failure')], ['state' => 'pending', 'statuses' => []]],
            // One passing, one running, one failing commit status: failing wins, and it is named.
            'mixed' => ['failing', [G::run('ci', 'completed', 'success'), G::run('lint', 'in_progress', null)],
                ['state' => 'failure', 'statuses' => [['context' => 'deploy', 'state' => 'failure', 'target_url' => 'https://x.test/d']]]],
            'passing' => ['passing', [G::run('ci', 'completed', 'success'), G::run('docs', 'completed', 'skipped')], ['state' => 'success', 'statuses' => [['context' => 's', 'state' => 'success']]]],
        ];
        foreach ($cases as $label => [$expected, $runs, $statuses]) {
            Cache::flush();
            G::install(['runs' => [200, ['check_runs' => $runs]], 'statuses' => [200, $statuses]]);
            $checks = $this->read()->assertOk()->json('checks');
            $this->assertSame($expected, $checks['state'], $label);
            if ($label === 'mixed') $this->assertSame([1, 1, 1], [$checks['passing'], $checks['pending'], $checks['failing']]);
            if ($label === 'mixed') $this->assertSame('deploy', $checks['failed'][0]['name']);
        }
    }

    public function test_a_rate_limited_or_unreadable_check_source_is_unknown_never_passing(): void
    {
        G::install(['runs' => [403, ['message' => 'rate limit']], 'statuses' => [403, ['message' => 'rate limit']]]);
        $checks = $this->read()->assertOk()->json('checks');
        $this->assertSame('unknown', $checks['state']);
        $this->assertTrue($checks['rateLimited']);
    }

    public function test_github_rate_limits_and_missing_repositories_come_back_as_a_flagged_answer(): void
    {
        G::install(['list' => [403, ['message' => 'rate limit']]]);
        $this->read()->assertOk()->assertJson(['ok' => false, 'rateLimited' => true]);
        Cache::flush();
        G::install(['repo' => [404, ['message' => 'Not Found']]]);
        $this->read()->assertOk()->assertJson(['ok' => false, 'notFound' => true]);
    }

    public function test_a_second_read_inside_the_cache_window_costs_github_nothing(): void
    {
        $fake = G::install();
        $this->read()->assertOk();
        $calls = count($fake->calls);
        $this->read()->assertOk();
        $this->assertSame($calls, count($fake->calls));
    }

    public function test_merged_conflicted_and_draft_states_are_reported(): void
    {
        G::install(['pull' => [200, G::pull(['merged' => true, 'state' => 'closed', 'merged_at' => '2026-10-02T10:00:00Z'])],
            'list' => [200, [G::pull(['state' => 'closed'])]]]);
        $this->read()->assertJson(['pullRequest' => ['state' => 'merged']]);
        Cache::flush();
        G::install(['pull' => [200, G::pull(['mergeable' => false, 'mergeable_state' => 'dirty', 'draft' => true])]]);
        $this->read()->assertJson(['pullRequest' => ['conflicts' => true, 'draft' => true]]);
    }

    public function test_a_repository_may_not_walk_out_of_repos_with_dot_segments(): void
    {
        $fake = G::install();
        foreach (['../x', 'x/..', './y', 'a/b/c', 'a b/c'] as $bad) {
            $this->getJson('/api/connectors/github/ship/status?repository='.rawurlencode($bad).'&branch=b')->assertStatus(422);
        }
        $this->assertSame([], $fake->calls);
    }

    public function test_the_route_is_off_pro_only_and_needs_the_connector(): void
    {
        G::install();
        config(['worktree_ship.enabled' => false]);
        $this->read()->assertStatus(503);
        config(['worktree_ship.enabled' => true]);
        $this->withToken($this->account('nogithub', false))->getJson('/api/connectors/github/ship/status?repository=fixture/repo&branch=b')->assertStatus(422);
        $this->withToken('nonsense')->getJson('/api/connectors/github/ship/status?repository=fixture/repo&branch=b')->assertStatus(401);
        config(['vibes.plan_limits_enabled' => true]);
        $this->withToken('owner')->getJson('/api/connectors/github/ship/status?repository=fixture/repo&branch=b')->assertStatus(402);
        $this->getJson('/api/connectors/github/ship/status?repository=../x&branch=b')->assertStatus(402);
    }
}
