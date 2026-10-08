<?php

namespace Tests\Feature;

use App\Models\{CreditLedger, User};
use App\Services\ModelResilience\{CacheUsage, PromptCache};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;
use Tests\Feature\Support\FundedVibesTurns;
use Tests\TestCase;

/** Provider cache hints on the Vibyra-funded paths (PROMPT_CACHING_ENABLED). Billing follows settled usage only. */
class PromptCachingTest extends TestCase
{
    use FundedVibesTurns;
    use RefreshDatabase;

    private const SONNET = 'anthropic/claude-sonnet-5.5';

    protected function setUp(): void
    {
        parent::setUp();
        $this->fundedSetUp([self::SONNET => ['prompt' => '0.000002', 'completion' => '0.00001', 'input_cache_read' => '0.0000002', 'input_cache_write' => '0.0000025'],
            'qwen/qwen3.8-flash' => ['prompt' => '0.00000015', 'completion' => '0.00000047']]);
        config(['model_resilience.prompt_caching.enabled' => true, 'model_resilience.prompt_caching.min_prefix_tokens' => 1]);
    }

    private function fixture(string $set): array
    {
        return json_decode(file_get_contents(base_path('tests/Fixtures/openrouter-cache/anthropic-five-turn.json')), true)[$set];
    }

    private function messages(int $history = 0): array
    {
        $m = [['role' => 'system', 'content' => str_repeat('Project rules. ', 400)]];
        for ($i = 0; $i < $history; $i++) { $m[] = ['role' => 'user', 'content' => "Q$i"]; $m[] = ['role' => 'assistant', 'content' => "A$i"]; }
        return [...$m, ['role' => 'user', 'content' => 'Latest question']];
    }

    public function test_an_anthropic_prefix_gets_breakpoints_on_the_system_prompt_and_the_latest_user_turn(): void
    {
        $out = app(PromptCache::class)->apply(['model' => self::SONNET, 'messages' => $this->messages(2), 'max_tokens' => 100]);
        $this->assertSame(['type' => 'ephemeral'], $out['messages'][0]['content'][0]['cache_control']);
        $this->assertSame('Latest question', $out['messages'][5]['content'][0]['text']);
        $this->assertSame(['type' => 'ephemeral'], $out['messages'][5]['content'][0]['cache_control']);
        $this->assertSame('Q0', $out['messages'][1]['content'], 'history in between is untouched');
        $this->assertSame(100, $out['max_tokens']);
    }

    public function test_a_first_turn_marks_only_the_stable_prefix(): void
    {
        $out = app(PromptCache::class)->apply(['model' => self::SONNET, 'messages' => $this->messages(0)]);
        $this->assertArrayHasKey('cache_control', $out['messages'][0]['content'][0]);
        $this->assertSame('Latest question', $out['messages'][1]['content'], 'new text the next call cannot read back is not marked');
    }

    public function test_a_prefix_below_the_provider_minimum_is_left_alone(): void
    {
        config(['model_resilience.prompt_caching.min_prefix_tokens' => 1024]);
        $payload = ['model' => self::SONNET, 'messages' => [['role' => 'system', 'content' => 'Short.'], ['role' => 'user', 'content' => 'Hi']]];
        $this->assertSame($payload, app(PromptCache::class)->apply($payload));
    }

    public function test_automatic_cache_models_get_a_stable_tool_order_and_no_breakpoints(): void
    {
        $tool = fn ($n) => ['type' => 'function', 'function' => ['name' => $n, 'parameters' => ['type' => 'object']]];
        $a = app(PromptCache::class)->apply(['model' => 'openai/gpt-6-luna', 'messages' => $this->messages(1), 'tools' => [$tool('write'), $tool('read')]]);
        $b = app(PromptCache::class)->apply(['model' => 'openai/gpt-6-luna', 'messages' => $this->messages(1), 'tools' => [$tool('read'), $tool('write')]]);
        $this->assertSame(json_encode($a), json_encode($b), 'the same request, byte for byte, whatever order the tools were assembled in');
        $this->assertStringNotContainsString('cache_control', json_encode($a));
    }

    public function test_an_unknown_provider_and_the_off_switch_change_nothing(): void
    {
        $payload = ['model' => 'acme/unknown-1', 'messages' => $this->messages(1)];
        $this->assertSame($payload, app(PromptCache::class)->apply($payload));
        config(['model_resilience.prompt_caching.enabled' => false]);
        $payload = ['model' => self::SONNET, 'messages' => $this->messages(1)];
        $this->assertSame($payload, app(PromptCache::class)->apply($payload));
    }

    public function test_cache_usage_reads_openrouters_fields_and_anthropics_own(): void
    {
        $this->assertSame(['read' => 6800, 'write' => 400], CacheUsage::from($this->fixture('warm')[2]['usage']));
        $this->assertSame(['read' => 7, 'write' => 3], CacheUsage::from(['cache_read_input_tokens' => 7, 'cache_creation_input_tokens' => 3]));
        $this->assertSame(['read' => 0, 'write' => 0], CacheUsage::from(null));
    }

    public function test_a_phone_turn_sends_hints_records_cache_tokens_and_charges_the_settled_cost_exactly(): void
    {
        [$warm, $cold] = [$this->fixture('warm'), $this->fixture('cold')];
        $this->answers(Http::response($warm[0]), Http::response($warm[1]));
        [$firstId, $chat] = $this->submit(self::SONNET);
        $first = $this->execute($firstId);
        $second = $this->execute($this->submit(self::SONNET, $chat, 'And then?')[0]);

        [$one, $two] = $this->sent();
        $this->assertIsString($one['messages'][1]['content'], 'a first turn has no history, so its tail is not marked');
        $this->assertArrayHasKey('cache_control', $one['messages'][0]['content'][0]);
        $this->assertArrayHasKey('cache_control', $two['messages'][array_key_last($two['messages'])]['content'][0]);

        $unit = 10000;
        foreach ([[$first, $warm[0]], [$second, $warm[1]]] as [$turn, $response]) {
            $this->assertSame((int) ceil($response['usage']['cost'] * 1_000_000 / $unit), (int) $turn->charged, 'the charge is the provider\'s settled cost');
            $meta = $this->settlement($turn->id);
            $this->assertSame($response['usage']['prompt_tokens_details']['cached_tokens'], $meta['cacheReadTokens'] ?? 0);
            $this->assertSame($response['usage']['prompt_tokens_details']['cache_write_tokens'], $meta['cacheWriteTokens'] ?? 0);
        }
        // The same cost billed without a cache is the same arithmetic: nothing about billing depends on cache fields.
        $this->assertGreaterThan(0, (int) $second->cache_read_tokens);
        $this->assertLessThan($cold[1]['usage']['cost'], $warm[1]['usage']['cost']);
    }

    public function test_with_the_switch_off_a_turn_is_sent_unmarked_and_its_receipt_has_no_cache_fields(): void
    {
        config(['model_resilience.prompt_caching.enabled' => false]);
        $this->answers(Http::response($this->fixture('warm')[1]));
        $turn = $this->runTurn(self::SONNET);
        $this->assertStringNotContainsString('cache_control', json_encode($this->sent()[0]));
        $this->assertArrayNotHasKey('cacheReadTokens', $this->settlement($turn->id));
        $this->assertSame(0, (int) $turn->cache_read_tokens);
    }

    public function test_measured_savings_over_a_five_turn_conversation_from_recorded_response_fixtures(): void
    {
        $set = json_decode(file_get_contents(base_path('tests/Fixtures/openrouter-cache/anthropic-five-turn.json')), true);
        $price = $set['pricing']['per_token_usd'];
        $total = fn (array $turns) => array_sum(array_column(array_column($turns, 'usage'), 'cost'));
        foreach (['cold', 'warm'] as $name) { // each fixture's cost must be reproducible from its own token counts
            foreach ($set[$name] as $r) {
                $u = $r['usage']; $c = CacheUsage::from($u);
                $uncached = $u['prompt_tokens'] - $c['read'] - $c['write'];
                $expected = $uncached * $price['prompt'] + $c['read'] * $price['input_cache_read'] + $c['write'] * $price['input_cache_write'] + $u['completion_tokens'] * $price['completion'];
                $this->assertEqualsWithDelta($expected, $u['cost'], 1e-7, "$name fixture {$r['id']}");
            }
        }
        $savings = 1 - $total($set['warm']) / $total($set['cold']);
        fwrite(STDERR, sprintf("\n[prompt-cache fixture] cold \$%.4f, warm \$%.4f over 5 turns: %.1f%% cheaper\n", $total($set['cold']), $total($set['warm']), $savings * 100));
        $this->assertGreaterThan(0.45, $savings);
        $this->assertGreaterThan($set['cold'][0]['usage']['cost'], $set['warm'][0]['usage']['cost'], 'the first turn pays the cache-write premium');
    }

    public function test_legacy_chat_marks_the_prefix_and_records_cache_tokens_in_the_ledger_receipt(): void
    {
        $token = $this->flushHeaders()->postJson('/api/auth/signup', ['name' => 'Cache', 'email' => 'cache@example.com', 'password' => 'secret123'])->json('token');
        User::where('email', 'cache@example.com')->update(['plan' => 'starter', 'credits_balance' => 500]);
        $this->answers(Http::response($this->fixture('warm')[2]));
        $this->postJson('/api/chat', ['prompt' => 'Explain closures.', 'mode' => 'chat', 'model' => 'claude-sonnet-5-5',
            'history' => [['role' => 'user', 'text' => 'Hi'], ['role' => 'assistant', 'text' => 'Hello']]], ['Authorization' => "Bearer {$token}"])->assertOk();

        $this->assertStringContainsString('"cache_control":{"type":"ephemeral"}', json_encode($this->sent()[0]));
        $meta = CreditLedger::where('kind', 'chat')->firstOrFail()->meta;
        $this->assertSame(['read_tokens' => 6800, 'write_tokens' => 400], $meta['cache']);
    }
}
