<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\Personalization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue};
use Tests\TestCase;

/** Settings > Memory's own parts: name, occupation, more about you and the summary, each with its switch. */
class VibesMemoryProfileApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'profile-session'), 'device_name' => 'iPhone']);
        $this->withToken('profile-session');
    }

    public function test_each_part_saves_on_its_own_and_keeps_the_rest(): void
    {
        $this->postJson('/api/vibes/preferences', ['name' => "  Ellis \n Threader "])->assertOk()
            ->assertJsonPath('preferences.name', 'Ellis Threader', 'one line, trimmed');
        $this->postJson('/api/vibes/preferences', ['occupation' => 'Product builder', 'style' => 'concise'])->assertOk();
        $summary = "I'm building Vibyra.\r\n\r\n- Based in London\n- Learning Laravel  ";
        $this->postJson('/api/vibes/preferences', ['about' => 'Likes calm interfaces.', 'summary' => $summary])->assertOk()
            ->assertJsonPath('preferences.summary', "I'm building Vibyra.\n\n- Based in London\n- Learning Laravel", 'lines kept, ends trimmed');
        $this->postJson('/api/vibes/preferences', ['nameEnabled' => false, 'summaryEnabled' => false])->assertOk()
            ->assertJsonPath('preferences.nameEnabled', false)->assertJsonPath('preferences.summaryEnabled', false)
            ->assertJsonPath('preferences.occupationEnabled', true)->assertJsonPath('preferences.name', 'Ellis Threader')
            ->assertJsonPath('preferences.style', 'concise')->assertJsonPath('preferences.occupation', 'Product builder');
        $this->assertSame(1, DB::table('vibes_preferences')->count());
    }

    public function test_each_part_has_its_limit_and_its_own_sentence(): void
    {
        foreach ([[['name' => str_repeat('a', 61)], 'Keep your name to 60 characters.'],
            [['occupation' => str_repeat('a', 121)], 'Keep your occupation to 120 characters.'],
            [['about' => str_repeat('a', 1501)], 'Keep “More about you” to 1,500 characters.'],
            [['summary' => str_repeat('a', 8001)], 'Keep your memory summary to 8,000 characters.'],
            [['summary' => ['a']], 'Your memory summary must be text.'],
            [['aboutEnabled' => 'yes'], 'Turn “More about you” on or off.']] as [$body, $error]) {
            $this->postJson('/api/vibes/preferences', $body)->assertStatus(422)->assertExactJson(['ok' => false, 'error' => $error]);
        }
        // Exactly the limit is fine, in any script: it is characters, not bytes.
        $long = mb_substr(str_repeat('Café, then code. 東京. ', 600), 0, 8000);
        $this->postJson('/api/vibes/preferences', ['summary' => $long])->assertOk();
        $this->assertSame(8000, mb_strlen(DB::table('vibes_preferences')->value('summary')));
    }

    public function test_moderation_checks_what_the_person_writes_about_themselves(): void
    {
        foreach (['name', 'occupation', 'about', 'summary'] as $field) {
            $this->postJson('/api/vibes/preferences', [$field => 'f.u.c.k this project'])
                ->assertStatus(422)->assertJsonPath('moderation.blocked', true);
        }
        $this->assertSame(0, DB::table('vibes_preferences')->count());
    }

    public function test_memories_say_whether_a_chat_saved_them(): void
    {
        app(Personalization::class)->remember($this->user->id, 'Prefers TypeScript.', 'chat');
        $this->postJson('/api/vibes/memories', ['text' => 'Writes in British English.'])->assertOk()
            ->assertJsonPath('memories.0.source', 'user')->assertJsonPath('memories.1.source', 'chat')
            ->assertJsonPath('memories.1.text', 'Prefers TypeScript.');
    }
}
