<?php

namespace Tests\Feature;

use Tests\Support\ShipGithub as G;

class WorktreeShipPullRequestTest extends WorktreeShipTestCase
{
    private function open(array $over = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/connectors/github/ship/pull-request', $over + ['repository' => 'fixture/repo',
            'head' => 'vibyra/task', 'title' => 'Add a', 'body' => 'Opened from Vibyra.', 'expectedHeadSha' => G::HEAD]);
    }

    private function created(array $over = []): array
    {
        return G::pull($over + ['draft' => true]);
    }

    public function test_it_opens_a_draft_against_the_default_branch_without_the_agent_flag(): void
    {
        config(['agents.github_pr_enabled' => false]);
        $fake = G::install(['list' => [200, []], 'create' => [201, $this->created()]]);
        $this->open()->assertCreated()->assertJson(['ok' => true, 'opened' => true, 'number' => 7, 'draft' => true, 'baseRef' => 'main',
            'headSha' => G::HEAD, 'baseSha' => G::BASE]);
        $this->assertSame(['POST /repos/fixture/repo/pulls'], $fake->wrote());
        \Illuminate\Support\Facades\Http::assertSent(fn ($r) => $r->method() === 'POST' && str_ends_with($r->url(), '/pulls')
            && $r->data() === ['title' => 'Add a', 'head' => 'vibyra/task', 'base' => 'main', 'body' => 'Opened from Vibyra.', 'draft' => true]);
    }

    public function test_a_second_request_for_the_same_branch_names_the_existing_pull_request(): void
    {
        $fake = G::install();
        $this->open()->assertStatus(409)->assertJson(['ok' => false, 'duplicate' => true, 'pullRequest' => ['number' => 7]]);
        $this->assertSame([], $fake->wrote());
    }

    public function test_a_branch_that_is_not_on_github_is_refused_before_any_write(): void
    {
        $fake = G::install(['list' => [200, []], 'headRef' => [404, ['message' => 'Not Found']]]);
        $this->open()->assertStatus(422)->assertJson(['ok' => false, 'notPushed' => true]);
        $this->assertSame([], $fake->wrote());
    }

    public function test_a_branch_that_moved_since_the_person_looked_is_refused(): void
    {
        $fake = G::install(['list' => [200, []], 'headRef' => [200, ['ref' => 'refs/heads/vibyra/task', 'object' => ['type' => 'commit', 'sha' => G::NEWER]]]]);
        $this->open()->assertStatus(409)->assertJson(['headMoved' => true]);
        $this->assertSame([], $fake->wrote());
    }

    public function test_an_unconfirmed_post_is_reported_and_never_retried(): void
    {
        $fake = G::install(['list' => [200, []], 'create' => [201, ['number' => 7]]]);
        $this->open()->assertStatus(502)->assertJson(['unconfirmed' => true]);
        $this->assertSame(1, count($fake->wrote()));
        $fake = G::install(['list' => [200, []], 'create' => [422, ['message' => 'Validation Failed']]]);
        $this->open()->assertStatus(422)->assertJson(['ok' => false]);
    }

    public function test_it_needs_a_title_a_pinned_commit_a_real_branch_and_the_connector(): void
    {
        $fake = G::install();
        $this->open(['title' => ''])->assertStatus(422);
        $this->open(['expectedHeadSha' => 'main'])->assertStatus(422);
        $this->open(['head' => '../etc'])->assertStatus(422);
        $this->open(['repository' => 'a/../b'])->assertStatus(422);
        $this->withToken($this->account('bare', false))->postJson('/api/connectors/github/ship/pull-request', ['repository' => 'fixture/repo',
            'head' => 'vibyra/task', 'title' => 'x', 'expectedHeadSha' => G::HEAD])->assertStatus(422);
        $this->assertSame([], $fake->calls);
    }

    public function test_a_non_draft_pull_request_is_possible_only_when_asked_for(): void
    {
        G::install(['list' => [200, []], 'create' => [201, $this->created(['draft' => false])]]);
        $this->open(['draft' => false])->assertCreated()->assertJson(['draft' => false]);
    }
}
