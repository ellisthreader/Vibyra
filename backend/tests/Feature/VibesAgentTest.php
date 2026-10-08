<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Services\Vibes\{AgentTools, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Feature\Support\PinnedVibesTrial;
use Tests\TestCase;

class VibesAgentTest extends TestCase
{
    use PinnedVibesTrial;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pinTrial();
    }

    public function test_tool_loop_aggregates_cost_and_duplicate_decisions_do_not_queue_twice(): void
    {
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']); Queue::fake();
        $user = User::factory()->create(); app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $chat = (string) Str::uuid(); $id = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user->id, 'title' => 'Project']);
        $q = ['chatId' => $chat, 'text' => 'Read hello.txt', 'model' => 'qwen/qwen3.8-flash', 'trial' => true, 'max' => 50,
            'expires' => now()->addMinute()->timestamp, 'revision' => 0,
            'request' => ['model' => 'qwen/qwen3.8-flash', 'messages' => [['role' => 'user', 'content' => 'Read hello.txt']],
                'tools' => AgentTools::definitions(), 'max_tokens' => 2048, 'provider' => ['max_price' => ['prompt' => 0.15, 'completion' => 0.47]]]];
        app(Turns::class)->submit($user->id, $id, $q);
        Http::fakeSequence()->push(['id' => 'gen-one', 'usage' => ['cost' => 0.012], 'choices' => [['message' => [
            'role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call-one', 'type' => 'function',
                'function' => ['name' => 'read_file', 'arguments' => '{"path":"hello.txt"}']]]]]]])
            ->push(['id' => 'gen-two', 'usage' => ['cost' => 0.014], 'choices' => [['message' => ['content' => 'The file says hello.']]]]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'waiting', 'actual_micro_usd' => 12000]);
        $tool = DB::table('vibes_tools')->first();
        $result = ['content' => 'hello', 'sha256' => hash('sha256', 'hello')];
        $user->forceFill(['guest_at' => now()])->save();
        \App\Models\VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'guest-tools'), 'device_name' => 'iPhone']);
        $this->withToken('guest-tools')->postJson('/api/vibes/tools/'.$tool->id.'/result',
            ['decision' => 'allow', 'result' => $result])->assertOk();
        app(AgentTools::class)->respond($user->id, $tool->id, 'allow', $result);
        Queue::assertPushed(RunVibesTurn::class, 1);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'charged' => 3, 'actual_micro_usd' => 26000, 'status' => 'completed']);
        $this->assertSame(97, app(Wallet::class)->payload($user->id)['available']);
        Http::assertSentCount(2);
        try { app(AgentTools::class)->respond($user->id, $tool->id, 'decline', ['declined' => true]); $this->fail(); }
        catch (HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
    }

    public function test_search_files_is_offered_and_validated_like_the_other_project_tools(): void
    {
        $names = array_column(array_column(AgentTools::definitions(), 'function'), 'name');
        $this->assertContains('search_files', $names);

        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']); Queue::fake();
        $user = User::factory()->create(); app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $chat = (string) Str::uuid(); $id = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user->id, 'title' => 'Vault']);
        $q = ['chatId' => $chat, 'text' => 'What did I decide about the writes contract?', 'model' => 'qwen/qwen3.8-flash',
            'trial' => true, 'max' => 50, 'expires' => now()->addMinute()->timestamp, 'revision' => 0,
            'request' => ['model' => 'qwen/qwen3.8-flash', 'messages' => [['role' => 'user', 'content' => 'search']],
                'tools' => AgentTools::definitions(), 'max_tokens' => 2048, 'provider' => ['max_price' => ['prompt' => 0.15, 'completion' => 0.47]]]];
        app(Turns::class)->submit($user->id, $id, $q);
        Http::fakeSequence()->push(['id' => 'gen-one', 'usage' => ['cost' => 0.01], 'choices' => [['message' => [
            'role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call-one', 'type' => 'function',
                'function' => ['name' => 'search_files', 'arguments' => '{"query":"writes contract"}']]]]]]]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $tool = DB::table('vibes_tools')->first();
        $this->assertSame('search_files', $tool->operation);
        $this->assertSame(['query' => 'writes contract'], json_decode($tool->arguments, true));
    }

    /** An empty search is refused before it ever reaches the phone. */
    public function test_an_empty_search_query_is_refused(): void
    {
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']); Queue::fake();
        $user = User::factory()->create(); app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $chat = (string) Str::uuid(); $id = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user->id, 'title' => 'Vault']);
        $q = ['chatId' => $chat, 'text' => 'search', 'model' => 'qwen/qwen3.8-flash', 'trial' => true, 'max' => 50,
            'expires' => now()->addMinute()->timestamp, 'revision' => 0,
            'request' => ['model' => 'qwen/qwen3.8-flash', 'messages' => [['role' => 'user', 'content' => 'search']],
                'tools' => AgentTools::definitions(), 'max_tokens' => 2048, 'provider' => ['max_price' => ['prompt' => 0.15, 'completion' => 0.47]]]];
        app(Turns::class)->submit($user->id, $id, $q);
        Http::fakeSequence()->push(['id' => 'gen-one', 'usage' => ['cost' => 0.01], 'choices' => [['message' => [
            'role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call-one', 'type' => 'function',
                'function' => ['name' => 'search_files', 'arguments' => '{"query":""}']]]]]]]);
        app()->call([new RunVibesTurn($id), 'handle']);
        // Usage is known and the invalid batch ran nothing: fail visibly, refund,
        // and release the chat instead of parking it in reconciliation.
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'failed', 'charged' => 0]);
        $this->assertDatabaseCount('vibes_tools', 0);
    }
}
