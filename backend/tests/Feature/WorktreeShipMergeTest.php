<?php

namespace Tests\Feature;

use Tests\Support\ShipGithub as G;

class WorktreeShipMergeTest extends WorktreeShipTestCase
{
    private function merge(array $over = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/connectors/github/ship/merge', $over + ['repository' => 'fixture/repo', 'number' => 7, 'expectedHeadSha' => G::HEAD]);
    }

    private function ready(array $over = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/connectors/github/ship/ready', $over + ['repository' => 'fixture/repo', 'number' => 7, 'expectedHeadSha' => G::HEAD]);
    }

    public function test_it_squash_merges_the_exact_reviewed_commit_by_default(): void
    {
        $fake = G::install();
        $this->merge()->assertOk()->assertJson(['ok' => true, 'merged' => true, 'method' => 'squash', 'branchDeleted' => false, 'headSha' => G::HEAD]);
        $this->assertSame(['PUT /repos/fixture/repo/pulls/7/merge'], $fake->wrote());
        \Illuminate\Support\Facades\Http::assertSent(fn ($r) => $r->method() === 'PUT' && $r->data() === ['sha' => G::HEAD, 'merge_method' => 'squash']);
    }

    public function test_a_stale_head_is_refused_before_anything_is_written(): void
    {
        $fake = G::install(['pull' => [200, G::pull(['head' => ['sha' => G::NEWER]])]]);
        $this->merge()->assertStatus(409)->assertJson(['ok' => false, 'headMoved' => true]);
        $this->assertSame([], $fake->wrote());
    }

    public function test_failing_and_pending_checks_refuse_unless_explicitly_overridden(): void
    {
        foreach (['failing' => G::run('ci', 'completed', 'failure'), 'pending' => G::run('ci', 'in_progress', null)] as $state => $run) {
            $fake = G::install(['runs' => [200, ['check_runs' => [$run]]]]);
            $this->merge()->assertStatus(409)->assertJson(['ok' => false, 'checks' => ['state' => $state]]);
            $this->assertSame([], $fake->wrote());
            $this->merge(['allowFailingChecks' => true])->assertOk()->assertJson(['merged' => true]);
        }
    }

    public function test_conflicts_drafts_checking_closed_and_already_merged_all_refuse(): void
    {
        $cases = [
            'conflicts' => [G::pull(['mergeable' => false, 'mergeable_state' => 'dirty']), 'conflicts'],
            'draft' => [G::pull(['draft' => true]), 'draft'],
            'checking' => [G::pull(['mergeable' => null]), 'checking'],
            'closed' => [G::pull(['state' => 'closed']), 'closed'],
            'alreadyMerged' => [G::pull(['merged' => true, 'state' => 'closed']), 'alreadyMerged'],
        ];
        foreach ($cases as $label => [$pull, $flag]) {
            $fake = G::install(['pull' => [200, $pull]]);
            $this->merge()->assertStatus(409)->assertJson(['ok' => false, $flag => true]);
            $this->assertSame([], $fake->wrote(), $label);
        }
    }

    public function test_a_protected_branch_or_a_head_that_moves_during_the_call_is_explained(): void
    {
        G::install(['merge' => [405, ['message' => 'Required status check "ci" is expected.']]]);
        $this->merge()->assertStatus(422)->assertJson(['ok' => false])->assertSee('Required status check', false);
        G::install(['merge' => [409, ['message' => 'Head branch was modified.']]]);
        $this->merge()->assertStatus(409)->assertJson(['headMoved' => true]);
    }

    public function test_a_merge_that_gets_no_answer_is_unconfirmed_and_not_repeated(): void
    {
        $fake = G::install();
        \Illuminate\Support\Facades\Http::swap(new \Illuminate\Http\Client\Factory);
        \Illuminate\Support\Facades\Http::fake(function ($request) use ($fake) {
            if ($request->method() === 'PUT') throw new \Illuminate\Http\Client\ConnectionException('timeout');
            return $fake->answer($request);
        });
        $this->merge()->assertStatus(502)->assertJson(['unconfirmed' => true]);
    }

    public function test_the_branch_is_deleted_only_when_asked_and_never_a_default_looking_one(): void
    {
        $fake = G::install();
        $this->merge(['deleteBranch' => true])->assertOk()->assertJson(['branchDeleted' => true]);
        $this->assertSame(['PUT /repos/fixture/repo/pulls/7/merge', 'DELETE /repos/fixture/repo/git/refs/heads/vibyra/task'], $fake->wrote());
        $fake = G::install(['pull' => [200, G::pull(['head' => ['ref' => 'main']])]]);
        $this->merge(['deleteBranch' => true])->assertOk()->assertJson(['branchDeleted' => false]);
        $this->assertSame(['PUT /repos/fixture/repo/pulls/7/merge'], $fake->wrote());
    }

    public function test_a_draft_is_marked_ready_for_the_reviewed_commit_only(): void
    {
        $draft = G::pull(['draft' => true]);
        $fake = G::install(['pull' => [200, $draft], 'graphql' => [200, ['data' => ['markPullRequestReadyForReview' => ['pullRequest' => ['isDraft' => false]]]]]]);
        $this->ready()->assertOk()->assertJson(['ok' => true, 'ready' => true]);
        $this->assertSame(['GET /repos/fixture/repo/pulls/7', 'POST /graphql'], $fake->calls);
        $fake = G::install(['pull' => [200, $draft]]);
        $this->ready(['expectedHeadSha' => G::NEWER])->assertStatus(409)->assertJson(['headMoved' => true]);
        G::install(['pull' => [200, $draft], 'graphql' => [200, ['errors' => [['message' => 'nope']]]]]);
        $this->ready()->assertStatus(422);
    }

    public function test_only_pro_accounts_with_the_route_on_can_merge(): void
    {
        $fake = G::install();
        config(['vibes.plan_limits_enabled' => true]);
        $this->merge()->assertStatus(402);
        config(['vibes.plan_limits_enabled' => false, 'worktree_ship.enabled' => false]);
        $this->merge()->assertStatus(503);
        $this->assertSame([], $fake->calls);
    }

    public function test_the_model_facing_merge_tool_is_off_by_default_and_has_its_own_flag(): void
    {
        $connector = app(\App\Services\ChatConnectors\Registry::class)->for('github');
        $names = fn () => array_column(array_column($connector->definitions(), 'function'), 'name');
        $this->assertNotContains('github_merge_pull_request', $names());
        $this->assertNotContains('github_merge_pull_request', $connector->writes());
        config(['worktree_ship.merge_tool_enabled' => true]);
        $this->assertContains('github_merge_pull_request', $names());
        $this->assertContains('github_merge_pull_request', $connector->writes());
        $args = $connector->validate('github_merge_pull_request', ['repository' => 'fixture/repo', 'number' => 7, 'expectedHeadSha' => G::HEAD]);
        $this->assertSame('squash', $args['method']);
        G::install();
        $out = $connector->run('github_merge_pull_request', $args, 'tok')['result'];
        $this->assertTrue($out['merged']);
        G::install(['pull' => [200, G::pull(['head' => ['sha' => G::NEWER]])]]);
        $this->assertFalse($connector->run('github_merge_pull_request', $args, 'tok')['result']['merged']);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $connector->validate('github_merge_pull_request', ['repository' => 'fixture/repo', 'number' => 7, 'expectedHeadSha' => 'HEAD']);
    }
}
