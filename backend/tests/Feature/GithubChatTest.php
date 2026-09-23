<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class GithubChatTest extends TestCase
{
    use RefreshDatabase;

    public static function scenarios(): array { return ['PR review' => ['review'], 'Stakeholder update' => ['activity'], 'Final step answers' => ['laststep']]; }

    #[\PHPUnit\Framework\Attributes\DataProvider('scenarios')]
    public function test_github_reads_real_tool_results_then_settles_once_without_exposing_credentials(string $scenario): void
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
        Http::fake(['api.github.com/user' => Http::response(['login' => 'ellis'])]);
        $this->postJson('/api/connectors/github/connect', ['credential' => 'private-fixture-token'])->assertOk();
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Review'])->assertOk();
        $prompt = $scenario !== 'activity' ? '@github review o/r#4 and identify weak tests' : '@github turn the last 7 days of o/r commits and merged PRs into a stakeholder update';
        $q = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => $prompt,
            'model' => 'qwen/qwen3.8-flash', 'integrations' => ['github']])->assertOk()->json();
        $answer = 'The diff removes a validation guard. Add a regression test for invalid input: https://github.com/o/r/pull/4';
        $calls = $scenario !== 'activity' ? [
            ['id' => 'details', 'type' => 'function', 'function' => ['name' => 'github_pull_request', 'arguments' => '{"repository":"o/r","number":4}']],
            ['id' => 'files', 'type' => 'function', 'function' => ['name' => 'github_pull_request_files', 'arguments' => '{"repository":"o/r","number":4}']],
        ] : [['id' => 'activity', 'type' => 'function', 'function' => ['name' => 'github_repository_activity', 'arguments' => '{"repository":"o/r"}']]];
        Http::fake([
            'openrouter.ai/*' => Http::sequence()->push(['id' => 'first', 'usage' => ['cost' => 0.0001], 'choices' => [['message' => [
                'role' => 'assistant', 'content' => null, 'tool_calls' => $calls,
            ]]]])->push(['id' => 'second', 'usage' => ['cost' => 0.0001], 'choices' => [['message' => ['content' => $answer]]]]),
            'api.github.com/repos/o/r/commits?*' => Http::response([['sha' => 'abc', 'commit' => ['message' => 'if (!valid) guard fix']]]),
            'api.github.com/search/issues*' => Http::response(['items' => [], 'total_count' => 0]),
            'api.github.com/repos/o/r/pulls/4' => Http::response(['number' => 4, 'title' => 'Remove guard', 'html_url' => 'https://github.com/o/r/pull/4', 'head' => ['sha' => 'abc']]),
            'api.github.com/repos/o/r/pulls/4/files*' => Http::response([['filename' => 'validate.ts', 'patch' => '- if (!valid) throw new Error();']]),
            'api.github.com/repos/o/r/pulls/4/reviews*' => Http::response([]),
            'api.github.com/repos/o/r/commits/abc/check-runs*' => Http::response(['check_runs' => []]),
            'api.github.com/repos/o/r/commits/abc/status*' => Http::response(['state' => 'pending', 'statuses' => []]),
        ]);
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $q['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'queued']);
        if ($scenario === 'laststep') DB::table('vibes_turns')->where('id', $id)->update(['step_count' => 3]);
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->getJson('/api/vibes/turns/'.$id)->assertOk()->assertJsonPath('turn.status', 'completed')
            ->assertJsonPath('turn.response', $answer)->assertJsonMissingPath('turn.tools.0.result');
        Http::assertSent(function ($r) use ($calls, $scenario) {
            if (!str_contains($r->url(), 'openrouter.ai')) return false;
            $messages = $r['messages'];
            return ($scenario !== 'laststep' || !isset($r['tools'])) && str_contains(json_encode($messages), 'if (!valid)') && count(array_filter($messages, fn ($m) => $m['role'] === 'tool')) === count($calls)
                && !str_contains(json_encode($r->data()), 'private-fixture-token');
        });
        $before = DB::table('vibes_turns')->where('id', $id)->value('charged');
        app()->call([new RunVibesTurn($id), 'handle']);
        $this->assertSame($before, DB::table('vibes_turns')->where('id', $id)->value('charged'));
    }
}
