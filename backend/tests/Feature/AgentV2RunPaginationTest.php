<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Models\AgentV2\Run;
use App\Services\Agents\Teammates;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2RunPaginationTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function seedRuns(int $count = 45): array
    {
        $first = Run::findOrFail($this->admit()['id']);
        $first->forceFill(['state' => 'completed', 'answer' => 'Answer 1'])->save();
        $ids = [$first->id];
        for ($seq = 2; $seq <= $count; $seq++) {
            $run = $first->replicate();
            $run->forceFill(['id' => (string) Str::uuid(), 'conversation_seq' => $seq,
                'idempotency_key' => 'history-'.$seq, 'prompt' => 'Task '.$seq, 'answer' => 'Answer '.$seq])->save();
            $ids[] = $run->id;
        }
        return $ids;
    }

    private function path(?string $cursor = null, ?string $agent = null): string
    {
        return '/api/agents/v2/runs?agentId='.($agent ?? $this->agent['id']).'&limit=20'.($cursor ? '&cursor='.$cursor : '');
    }

    public function test_all_runs_are_reachable_and_newest_insert_does_not_shift_older_pages(): void
    {
        $ids = $this->seedRuns();
        $head = $this->getJson($this->path())->assertOk();
        $this->assertCount(20, $head->json('runs'));
        $this->assertSame(array_reverse(array_slice($ids, 25)), array_column($head->json('runs'), 'id'));
        $cursor = $head->json('nextCursor');
        $this->assertSame($ids[25], $cursor);
        $new = Run::findOrFail($ids[44])->replicate();
        $new->forceFill(['id' => (string) Str::uuid(), 'conversation_seq' => 46, 'idempotency_key' => 'new-after-page'])->save();
        $second = $this->getJson($this->path($cursor))->assertOk();
        $this->assertSame(array_reverse(array_slice($ids, 5, 20)), array_column($second->json('runs'), 'id'));
        $last = $this->getJson($this->path($second->json('nextCursor')))->assertOk();
        $this->assertSame(array_reverse(array_slice($ids, 0, 5)), array_column($last->json('runs'), 'id'));
        $this->assertNull($last->json('nextCursor'));
        $all = array_merge($head->json('runs'), $second->json('runs'), $last->json('runs'));
        $this->assertCount(45, array_unique(array_column($all, 'id')));
        $this->getJson('/api/agents/v2/runs/'.$ids[0])->assertOk()->assertJsonPath('run.answer', 'Answer 1');
        $this->assertSame($new->id, $this->getJson($this->path())->json('runs.0.id'));
    }

    public function test_unknown_other_teammate_and_other_user_cursors_have_the_same_refusal(): void
    {
        $ids = $this->seedRuns(2);
        $failure = $this->getJson($this->path((string) Str::uuid()))->assertStatus(422)->assertJsonPath('code', 'invalid_cursor')->json();
        $otherAgent = app(Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => 'Other',
            'brief' => 'Other tasks.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        $this->assertSame($failure, $this->getJson($this->path($ids[0], $otherAgent['id']))->assertStatus(422)->json());
        $other = User::factory()->create();
        config(['agents_v2.user_ids' => $this->user->id.','.$other->id]);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other-pagination'), 'device_name' => 'Mac']);
        $this->withToken('other-pagination');
        $this->assertSame($failure, $this->getJson($this->path($ids[0]))->assertStatus(422)->json());
        $this->getJson('/api/agents/v2/runs/'.$ids[0])->assertNotFound();
        $this->getJson($this->path())->assertOk()->assertJsonPath('runs', [])->assertJsonPath('nextCursor', null);
    }

    public function test_paging_keeps_authentication_and_validation_boundaries(): void
    {
        $this->getJson($this->path().'&cursor=bad')->assertStatus(422);
        $this->getJson($this->path().'&limit=51')->assertStatus(422);
        $this->withToken('not-a-session')->getJson($this->path())->assertUnauthorized();
    }
}
