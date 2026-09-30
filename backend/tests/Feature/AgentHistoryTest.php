<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Agents\{RosterProjection, Teammates};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgentHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function teammate(User $user): array
    {
        app(\App\Services\Vibes\Wallet::class)->ensure($user);
        return app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(), 'name' => 'Reviewer', 'brief' => 'Review code',
            'memory' => '', 'avatar' => 'review', 'budget' => 10, 'integrations' => []]);
    }

    private function turn(User $user, array $agent, array $overrides = []): string
    {
        $id = (string) Str::uuid();
        DB::table('vibes_turns')->insert([...['id' => $id, 'user_id' => $user->id, 'chat_id' => $agent['chatId'],
            'digest' => str_repeat('a', 64), 'request' => '{}', 'allocations' => '[]', 'reserved' => 1, 'model' => 'test/model',
            'prompt' => 'Review', 'response' => 'Done', 'status' => 'completed', 'created_at' => now(), 'updated_at' => now()], ...$overrides]);
        return $id;
    }

    public function test_history_pages_without_gaps_even_when_timestamps_match_and_rejects_foreign_cursors(): void
    {
        $this->freezeTime();
        $user = User::factory()->create(); $agent = $this->teammate($user);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'history-test'), 'device_name' => 'History test']);
        $this->withToken('history-test');
        $ids = []; for ($i = 0; $i < 205; $i++) $ids[] = $this->turn($user, $agent);
        sort($ids);
        $path = '/api/vibes/chats/'.$agent['chatId'].'/turns';
        $first = $this->getJson($path)->assertOk()->assertJsonPath('hasMore', true)->json();
        $this->assertCount(200, $first['turns']);
        $second = $this->getJson($path.'?before='.$first['nextBefore'])->assertOk()->assertJsonPath('hasMore', false)->json();
        $this->assertCount(5, $second['turns']);
        $this->assertSame($ids, array_column([...$second['turns'], ...$first['turns']], 'id'));
        $other = User::factory()->create(); $foreign = $this->turn($other, $this->teammate($other));
        $this->getJson($path.'?before='.$foreign)->assertNotFound();
        $this->getJson($path.'?before=invalid')->assertUnprocessable();
    }

    public function test_stopped_and_expired_actions_do_not_claim_they_need_approval(): void
    {
        $this->freezeTime();
        $user = User::factory()->create(); $agent = $this->teammate($user);
        $turn = $this->turn($user, $agent, ['status' => 'waiting']);
        $tool = (string) Str::uuid();
        DB::table('vibes_tools')->insert(['id' => $tool, 'turn_id' => $turn, 'provider_id' => 'call-1', 'operation' => 'create_issue',
            'arguments' => '{}', 'integration' => 'github', 'action_state' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
        $projection = app(RosterProjection::class);
        $this->assertSame('needs_approval', $projection->list($user->id)[0]['status']);
        DB::table('vibes_turns')->where('id', $turn)->update(['status' => 'cancelled', 'cancel_requested' => true]);
        $this->assertSame('cancelled', $projection->list($user->id)[0]['status']);
        $this->assertSame(0, $projection->list($user->id)[0]['pendingDecisionCount']);
        $this->assertSame('cancelled', app(Teammates::class)->payload(app(Teammates::class)->get($user->id, $agent['id']))['status']);
        DB::table('vibes_turns')->where('id', $turn)->update(['status' => 'waiting', 'cancel_requested' => false]);
        $this->travel(16)->minutes();
        $this->assertSame(0, $projection->list($user->id)[0]['pendingDecisionCount']);
    }
}
