<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\{PersonalPrompt, Personalization, Quotes, TurnPrice};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/** What Personality and Memory put in front of the model, and that it is what gets priced and sent. */
class VibesPersonalPromptTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private string $chat;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'prompt-session'), 'device_name' => 'iPhone']);
        $this->withToken('prompt-session');
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake();
        $this->chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $this->chat, 'title' => 'Build a timer'])->assertOk();
    }

    /** The quote's response, and the provider request sealed inside it. */
    private function quote(): array
    {
        $response = $this->postJson('/api/vibes/quote', ['chatId' => $this->chat, 'text' => 'Build a timer', 'model' => 'auto'])
            ->assertOk()->json();

        return [$response, app(Quotes::class)->decode($response['quote'], $this->user->id)['request']];
    }

    private function system(array $request): string
    {
        $this->assertSame('system', $request['messages'][0]['role']);

        return $request['messages'][0]['content'];
    }

    public function test_memory_off_on_the_defaults_sends_the_prompt_it_always_did(): void
    {
        // Memory starts on, so a new account's chat is told how to save from its first turn.
        $on = $this->system($this->quote()[1]);
        $this->assertStringContainsString('<vibyra-memory>', $on);
        $this->assertStringNotContainsString('preferences for how you reply', $on);
        $this->assertStringNotContainsString('What you know about the person', $on, 'nothing known yet, so nothing claimed');
        $this->postJson('/api/vibes/preferences', ['style' => 'balanced', 'instructions' => '', 'memoryEnabled' => false])->assertOk();
        $off = $this->system($this->quote()[1]);
        $this->assertStringNotContainsString('vibyra-memory', $off);
        $this->assertSame($off."\n\n".PersonalPrompt::compose(['memoryEnabled' => true], [], true), $on, 'only the block differs');
    }

    public function test_style_instructions_and_memories_reach_the_prompt_after_the_rules(): void
    {
        $this->postJson('/api/vibes/preferences', ['style' => 'concise', 'instructions' => 'I use Expo and TypeScript.'])->assertOk();
        $this->postJson('/api/vibes/memories', ['text' => 'Builds an iPhone app.'])->assertOk();
        $this->postJson('/api/vibes/memories', ['text' => 'Writes in British English.'])->assertOk();
        $system = $this->system($this->quote()[1]);

        $this->assertStringStartsWith('You are Vibyra', $system, 'the rules still come first');
        $this->assertStringContainsString("\n\nThe person has set preferences for how you reply.", $system);
        $this->assertStringContainsString('Keep replies brief: lead with the answer and the code, and skip preamble.', $system);
        $this->assertStringContainsString('In their own words: "I use Expo and TypeScript."', $system);
        $this->assertLessThan(strpos($system, 'Builds an iPhone app.'), strpos($system, 'Writes in British English.'), 'newest first');
    }

    public function test_memories_stay_out_while_memory_is_off(): void
    {
        $this->postJson('/api/vibes/memories', ['text' => 'Builds an iPhone app.'])->assertOk();
        $this->postJson('/api/vibes/preferences', ['style' => 'friendly', 'memoryEnabled' => false])->assertOk();
        $system = $this->system($this->quote()[1]);

        $this->assertStringContainsString('Use a warm, encouraging tone and plain words.', $system);
        $this->assertStringNotContainsString('Builds an iPhone app.', $system);
        $this->assertStringNotContainsString('Saved memories', $system);
        $this->assertStringNotContainsString('vibyra-memory', $system, 'and the chat is not told how to save');
    }

    public function test_the_block_never_passes_its_cap_and_gives_up_the_oldest_memory_first(): void
    {
        $full = ['style' => 'detailed', 'instructions' => str_repeat('Explain the backend. ', 48), 'memoryEnabled' => true,
            'name' => str_repeat('N', 60), 'occupation' => str_repeat('O', 120), 'about' => str_repeat('About me. ', 150),
            'summary' => 'Summary start. '.str_repeat('Everything about me. ', 380).'Summary end.'];
        $memories = array_map(fn ($i) => 'Memory '.str_pad((string) $i, 2, '0', STR_PAD_LEFT).' '.str_repeat('detail ', 27), range(50, 1));
        $block = PersonalPrompt::compose($full, $memories, true);
        $this->assertLessThanOrEqual(PersonalPrompt::CAP, strlen($block));
        $this->assertStringContainsString('Memory 50', $block, 'the newest memory is kept');
        $this->assertStringNotContainsString('Memory 01', $block, 'the oldest goes first');
        $this->assertStringContainsString('Summary end.', $block, 'every part at its limit still fits whole');
        $this->assertStringContainsString('<vibyra-memory>', $block, 'the way to save is never cut');

        // Three bytes a character: the older memories go, then the summary gives way and
        // says so, and the ten newest memories - what the chat saved last - still stand.
        $wide = PersonalPrompt::compose([...$full, 'summary' => str_repeat('東京で働いています。', 800)], $memories, true);
        $this->assertLessThanOrEqual(PersonalPrompt::CAP, strlen($wide));
        $this->assertTrue(mb_check_encoding($wide, 'UTF-8'), 'cut on a character boundary');
        $this->assertStringContainsString("…\n\"\"\"", $wide, 'the summary was shortened, and says so');
        $this->assertStringContainsString('Memory 41', $wide);
        $this->assertStringNotContainsString('Memory 40', $wide);
        $this->assertSame('', PersonalPrompt::compose(['style' => 'balanced', 'instructions' => '   ', 'memoryEnabled' => false], ['x']));
    }

    public function test_what_the_person_wrote_is_sent_while_its_switch_is_on(): void
    {
        $this->postJson('/api/vibes/preferences', ['name' => 'Ellis', 'occupation' => 'Product builder',
            'about' => 'Likes calm interfaces.', 'summary' => "Building Vibyra.\nBased in London."])->assertOk();
        $system = $this->system($this->quote()[1]);
        foreach (['Name: Ellis', 'Occupation: Product builder', "\"\"\"\nLikes calm interfaces.\n\"\"\"",
            "Their memory summary, in their own words:\n\"\"\"\nBuilding Vibyra.\nBased in London.\n\"\"\""] as $line) $this->assertStringContainsString($line, $system);
        $this->assertLessThan(strpos($system, 'What you know about the person'), strpos($system, 'You are Vibyra'));
        $this->postJson('/api/vibes/preferences', ['nameEnabled' => false, 'summaryEnabled' => false])->assertOk();
        $system = $this->system($this->quote()[1]);
        $this->assertFalse(str_contains($system, 'Ellis') || str_contains($system, 'Building Vibyra.'), 'switched-off parts are not sent');
        $this->assertStringContainsString('Occupation: Product builder', $system, 'the other parts stay');

        $this->postJson('/api/vibes/preferences', ['memoryEnabled' => false])->assertOk();
        $this->assertStringNotContainsString('Product builder', $this->system($this->quote()[1]), 'the master switch stops all of it');
    }

    public function test_a_turn_with_tools_is_never_told_how_to_change_memory(): void
    {
        $this->postJson('/api/vibes/preferences', ['name' => 'Ellis'])->assertOk();
        DB::table('vibes_chats')->where('id', $this->chat)->update(['binding' => 'project-binding']);
        $request = $this->quote()[1];
        $this->assertNotEmpty($request['tools']);
        $this->assertStringContainsString('Name: Ellis', $this->system($request), 'it still knows them');
        $this->assertStringNotContainsString('vibyra-memory', $this->system($request));
        $this->assertStringContainsString('You cannot save or forget memories in this chat.', $this->system($request));
    }

    public function test_a_long_chat_keeps_its_history_beside_the_largest_preferences(): void
    {
        foreach (range(1, 12) as $i) {
            DB::table('vibes_turns')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'chat_id' => $this->chat,
                'digest' => str_repeat('0', 64), 'model' => 'qwen/qwen3.8-flash', 'status' => 'completed', 'request' => '{}',
                'allocations' => '[]', 'prompt' => 'Question '.$i.' '.str_repeat('about the timer ', 30),
                'response' => 'Answer '.$i.' '.str_repeat('with some code ', 90), 'reserved' => 1,
                'settled_at' => now(), 'created_at' => now()->subMinutes(20 - $i), 'updated_at' => now()]);
        }
        $this->postJson('/api/vibes/preferences', ['style' => 'detailed', 'instructions' => str_repeat('Explain each step. ', 52),
            'about' => str_repeat('About me. ', 150), 'summary' => str_repeat('Everything about me. ', 380)])->assertOk();
        foreach (range(1, 50) as $i) app(Personalization::class)->remember($this->user->id, 'Saved fact '.$i.' '.str_repeat('context ', 23));
        $messages = $this->quote()[1]['messages'];

        $this->assertStringContainsString('Explain step by step and name the trade-offs.', $messages[0]['content']);
        $this->assertGreaterThan(15000, strlen($messages[0]['content']), 'the whole memory is sent');
        $this->assertLessThanOrEqual(20000, strlen((string) json_encode(array_slice($messages, 1))), 'the history has its own budget');
        $this->assertGreaterThanOrEqual(12, count($messages), 'a long memory costs the chat none of its history');
        $this->assertStringStartsWith('Answer 12', $messages[count($messages) - 2]['content'], 'the latest reply is the one kept');
    }

    public function test_the_quote_counts_the_personal_block_in_its_price(): void
    {
        [$plain, $request] = $this->quote();
        $this->postJson('/api/vibes/preferences', ['style' => 'detailed', 'instructions' => str_repeat('Explain each step. ', 52)])->assertOk();
        foreach (range(1, 20) as $i) app(Personalization::class)->remember($this->user->id, 'Saved fact '.$i.' '.str_repeat('context ', 20));
        [$personal, $personalRequest] = $this->quote();

        $this->assertGreaterThan(TurnPrice::inputBound($request['messages']), TurnPrice::inputBound($personalRequest['messages']));
        $this->assertGreaterThanOrEqual($plain['maxCredits'], $personal['maxCredits']);
    }

    public function test_a_change_after_quoting_cannot_change_the_turn_that_runs(): void
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $this->postJson('/api/vibes/preferences', ['style' => 'concise'])->assertOk();
        [$quoted] = $this->quote();
        // Changed between the estimate and the send: the send is still the estimate.
        $this->postJson('/api/vibes/preferences', ['style' => 'friendly'])->assertOk();
        $this->postJson('/api/vibes/memories', ['text' => 'Added after the quote.'])->assertOk();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quoted['quote']])->assertStatus(202);
        Http::fake(['*' => Http::response(['id' => 'generation-1', 'usage' => ['cost' => 0.001],
            'choices' => [['message' => ['content' => 'Here is a timer.']]]])]);
        app()->call([new RunVibesTurn($id), 'handle']);

        Http::assertSent(function ($sent) {
            $system = $sent->data()['messages'][0]['content'] ?? '';

            return str_contains($system, 'Keep replies brief') && ! str_contains($system, 'warm, encouraging')
                && ! str_contains($system, 'Added after the quote.');
        });
    }
}
