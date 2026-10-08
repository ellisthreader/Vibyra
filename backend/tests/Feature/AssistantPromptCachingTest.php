<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

/** The assistant gateway's cache key and receipt (PROMPT_CACHING_ENABLED); the charge is unchanged either way. */
class AssistantPromptCachingTest extends TestCase
{
    use AssistantFixture, RefreshDatabase;

    private bool $faked = false;

    private function ask(string $text, array $extra = []): void
    {
        // Faked once: a second Http::fake() would replace the recorder and lose the first request.
        if (! $this->faked) Http::fake(['api.openai.com/*' => fn () => Http::response($this->stream(['prompt_tokens' => 100, 'completion_tokens' => 20,
            'prompt_tokens_details' => ['cached_tokens' => 80]]))]);
        $this->faked = true;
        $this->postJson('/api/assistant/chat', $this->chat(['messages' => [['role' => 'system', 'content' => 'You are the Vibyra assistant.'],
            ['role' => 'user', 'content' => $text]], ...$extra]))->assertOk()->streamedContent();
    }

    public function test_the_cache_key_is_the_stable_prefix_and_cached_input_is_recorded_on_the_receipt(): void
    {
        config(['model_resilience.prompt_caching.enabled' => true]);
        $this->ask('First question'); $this->ask('A different question');
        $keys = Http::recorded()->map(fn ($r) => $r[0]->data()['prompt_cache_key'] ?? null)->all();
        $this->assertCount(2, $keys);
        $this->assertStringStartsWith('vibyra-assistant:', $keys[0]);
        $this->assertSame($keys[0], $keys[1], 'same system prompt and tools, same key, whatever the user asked');
        $meta = json_decode(DB::table('vibes_ledger')->where('kind', 'assistant_settlement')->orderBy('id')->value('metadata'), true);
        $this->assertSame(80, $meta['cacheReadTokens']);
    }

    public function test_the_charge_is_identical_with_the_switch_on_or_off(): void
    {
        config(['model_resilience.prompt_caching.enabled' => false]);
        $before = $this->funds();
        $this->ask('Hello');
        $off = $before - $this->funds();
        $this->assertArrayNotHasKey('prompt_cache_key', Http::recorded()->first()[0]->data());
        $this->assertArrayNotHasKey('cacheReadTokens', json_decode(DB::table('vibes_ledger')->where('kind', 'assistant_settlement')->value('metadata'), true));

        config(['model_resilience.prompt_caching.enabled' => true]);
        $before = $this->funds();
        $this->ask('Hello again');
        $this->assertSame($off, $before - $this->funds(), 'cached input was already priced at the cached rate; the hint changes no charge');
        $this->assertSame(47, $off);
    }
}
