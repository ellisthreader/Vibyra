<?php
namespace Tests\Feature;
use App\Models\User;
use App\Services\Agents\{RosterProjection, Teammates};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
class AgentRosterProjectionTest extends TestCase
{
    use RefreshDatabase;
    public function test_read_marker_is_account_scoped_idempotent_and_rejects_stale_output(): void
    {
        $user = User::factory()->create(); app(\App\Services\Vibes\Wallet::class)->ensure($user);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(), 'name' => 'Reviewer', 'brief' => 'Review code', 'memory' => '', 'avatar' => 'review', 'budget' => 10, 'integrations' => []]);
        $turn = (string) Str::uuid();
        DB::table('vibes_turns')->insert(['id' => $turn, 'user_id' => $user->id, 'chat_id' => $agent['chatId'], 'digest' => str_repeat('a', 64), 'request' => '{}', 'allocations' => '[]', 'reserved' => 1, 'model' => 'test-model', 'prompt' => 'Review', 'response' => 'First answer', 'status' => 'completed', 'created_at' => now(), 'updated_at' => now()]);
        $projection = app(RosterProjection::class);
        $first = $projection->list($user->id)[0];
        $this->assertTrue($first['unread']); $this->assertSame('test-model', $first['execution']);
        $projection->read($user->id, $agent['id'], $first['readCursor']);
        $projection->read($user->id, $agent['id'], $first['readCursor']);
        $this->assertFalse($projection->list($user->id)[0]['unread']);
        $other = User::factory()->create(); $this->assertSame([], $projection->list($other->id));
        DB::table('vibes_turns')->where('id', $turn)->update(['response' => 'New answer']);
        $this->assertTrue($projection->list($user->id)[0]['unread']);
        try { $projection->read($user->id, $agent['id'], $first['readCursor']); $this->fail('Stale read accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $error) { $this->assertSame(409, $error->getStatusCode()); }
        $this->assertTrue($projection->list($user->id)[0]['unread']);
    }
}
