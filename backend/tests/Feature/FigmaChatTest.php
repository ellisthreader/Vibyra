<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class FigmaChatTest extends TestCase
{
    use RefreshDatabase;

    public static function scenarios(): array { return ['Frames and comments' => ['read'], 'Provider refuses' => ['refused'], 'Final step answers' => ['laststep'], 'Invalid arguments' => ['invalid'], 'Broken JSON' => ['json']]; }

    #[\PHPUnit\Framework\Attributes\DataProvider('scenarios')]
    public function test_figma_reference_reads_results_and_failures_without_exposing_credentials(string $scenario): void
    {
        config(['vibes.enabled' => true, 'chat_connectors.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $user = User::factory()->create(['guest_at' => now(), 'provider' => 'guest']);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'guest'), 'device_name' => 'iPhone']);
        $this->withToken('guest');
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake(); Http::preventStrayRequests();
        Http::fake(['api.figma.com/v1/me' => Http::response(['handle' => 'fixture'])]);
        $this->postJson('/api/connectors/figma/connect', ['credential' => 'private-fixture-token'])->assertOk();
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Review'])->assertOk();
        $prompt = '@figma inspect frames and comments in https://www.figma.com/design/AbCdEfGhIj12/Test';
        $q = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => $prompt,
            'model' => 'qwen/qwen3.8-flash', 'integrations' => ['figma']])->assertOk()->assertJsonPath('integrations', ['figma'])->json();
        $answer = $scenario === 'refused' ? 'Figma refused access to this file.' : 'The file contains a Checkout frame and a comment about contrast.';
        $calls = array_map(fn ($operation) => ['id' => $operation, 'type' => 'function', 'function' => [
            'name' => $operation, 'arguments' => '{"file":"AbCdEfGhIj12"}',
        ]], ['figma_list_frames', 'figma_file_comments']);
        if ($scenario === 'invalid') $calls[0]['function']['arguments'] = '{"file":"invalid"}';
        if ($scenario === 'json') $calls[0]['function']['arguments'] = '{broken';
        Http::fake([
            'openrouter.ai/*' => Http::sequence()->push(['id' => 'first', 'usage' => ['cost' => 0.0001], 'choices' => [['message' => [
                'role' => 'assistant', 'content' => null, 'tool_calls' => $calls,
            ]]]])->push(['id' => 'second', 'usage' => ['cost' => 0.0001], 'choices' => [['message' => ['content' => $answer]]]]),
            'api.figma.com/v1/files/AbCdEfGhIj12/comments' => $scenario === 'refused' ? Http::response([], 403)
                : Http::response(['comments' => [['id' => 'c1', 'message' => 'Improve contrast', 'parent_id' => 'root']]]),
            'api.figma.com/v1/files/AbCdEfGhIj12*' => $scenario === 'refused' ? Http::response([], 403)
                : Http::response(['name' => 'Fixture design', 'document' => ['id' => '0:0', 'type' => 'DOCUMENT', 'children' => [
                    ['id' => '0:1', 'type' => 'CANVAS', 'name' => 'Page', 'children' => [['id' => '1:2', 'type' => 'FRAME', 'name' => 'Checkout']]],
                ]]]),
        ]);
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);
        if (in_array($scenario, ['invalid', 'json'])) {
            $this->getJson('/api/vibes/turns/'.$id)->assertOk()->assertJsonPath('turn.status', 'failed')->assertJsonPath('turn.charged', 0);
            $this->assertDatabaseCount('vibes_tools', 0);
            Http::assertNotSent(fn ($r) => str_contains($r->url(), '/files/'));
            return;
        }
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'queued']);
        if ($scenario === 'laststep') DB::table('vibes_turns')->where('id', $id)->update(['step_count' => 3]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->getJson('/api/vibes/turns/'.$id)->assertOk()->assertJsonPath('turn.status', 'completed')
            ->assertJsonPath('turn.response', $answer)->assertJsonMissingPath('turn.tools.0.result');
        Http::assertSent(function ($r) use ($calls, $scenario) {
            if (!str_contains($r->url(), 'openrouter.ai')) return false;
            $messages = $r['messages'];
            return ($scenario !== 'laststep' || !isset($r['tools'])) && ($scenario === 'refused' ? str_contains(json_encode($messages), 'error') : str_contains(json_encode($messages), 'Checkout') && str_contains(json_encode($messages), 'Improve contrast') && str_contains(json_encode($messages), 'parentId')) && count(array_filter($messages, fn ($m) => $m['role'] === 'tool')) === count($calls)
                && !str_contains(json_encode($r->data()), 'private-fixture-token');
        });
        $before = DB::table('vibes_turns')->where('id', $id)->value('charged');
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertSame($before, DB::table('vibes_turns')->where('id', $id)->value('charged'));
    }
}
