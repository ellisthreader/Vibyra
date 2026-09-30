<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\Personalization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue, RateLimiter};
use Illuminate\Support\Str;
use Tests\TestCase;

/** Settings > Personality and Memory: the routes, their limits and their refusals. */
class VibesPersonalizationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'vibes.guests_enabled' => true,
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        RateLimiter::clear('vibes-guest:'.hash('sha256', '127.0.0.1'));
        $this->user = $this->account('owner-session');
        $this->withToken('owner-session');
    }

    private function account(string $token): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'iPhone']);

        return $user;
    }

    public function test_a_new_account_reads_the_defaults_without_a_row_being_written(): void
    {
        $this->getJson('/api/vibes/preferences')->assertOk()->assertExactJson(['ok' => true,
            'preferences' => ['style' => 'balanced', 'instructions' => '', 'memoryEnabled' => true,
                'name' => '', 'nameEnabled' => true, 'occupation' => '', 'occupationEnabled' => true,
                'about' => '', 'aboutEnabled' => true, 'summary' => '', 'summaryEnabled' => true]]);
        $this->assertSame(0, DB::table('vibes_preferences')->count());
        $this->getJson('/api/vibes/memories')->assertOk()->assertExactJson(['ok' => true, 'memories' => [], 'limit' => 50]);
    }

    public function test_a_save_changes_only_the_fields_it_sends(): void
    {
        $this->postJson('/api/vibes/preferences', ['style' => 'concise'])->assertOk()
            ->assertJsonPath('preferences.style', 'concise')->assertJsonPath('preferences.memoryEnabled', true);
        $this->postJson('/api/vibes/preferences', ['instructions' => "  Use TypeScript.\r\nKeep diffs small.  "])->assertOk()
            ->assertJsonPath('preferences.style', 'concise')
            ->assertJsonPath('preferences.instructions', "Use TypeScript.\nKeep diffs small.");
        $this->postJson('/api/vibes/preferences', ['memoryEnabled' => false])->assertOk()
            ->assertJsonPath('preferences.memoryEnabled', false)->assertJsonPath('preferences.style', 'concise');
        $this->getJson('/api/vibes/preferences')->assertJsonPath('preferences.instructions', "Use TypeScript.\nKeep diffs small.");
        $this->assertSame(1, DB::table('vibes_preferences')->count());
    }

    public function test_invalid_values_are_refused_in_the_shape_the_phone_reads(): void
    {
        foreach ([['style' => 'sarcastic'], ['style' => 3], ['memoryEnabled' => 'yes'], ['instructions' => ['a']],
            ['instructions' => str_repeat('a', 1001)]] as $body) {
            $response = $this->postJson('/api/vibes/preferences', $body)->assertStatus(422);
            $this->assertFalse($response->json('ok'));
            $this->assertIsString($response->json('error'));
        }
        // Exactly the limit is fine, and nothing refused above was stored.
        $limit = mb_substr('Keep diffs small and explain why. '.str_repeat('Café au lait, then code. ', 60), 0, 1000);
        $this->assertSame(1000, mb_strlen(trim($limit)));
        $this->postJson('/api/vibes/preferences', ['instructions' => $limit])->assertOk()
            ->assertJsonPath('preferences.instructions', $limit)->assertJsonPath('preferences.style', 'balanced');
    }

    public function test_moderation_refuses_instructions_and_memories(): void
    {
        $this->postJson('/api/vibes/preferences', ['instructions' => 'f.u.c.k this project'])
            ->assertStatus(422)->assertJsonPath('ok', false)->assertJsonPath('moderation.blocked', true);
        $this->postJson('/api/vibes/memories', ['text' => 'f.u.c.k this project'])
            ->assertStatus(422)->assertJsonPath('ok', false)->assertJsonPath('moderation.blocked', true);
        $this->assertSame(0, DB::table('vibes_memories')->count());
        $this->assertSame(0, DB::table('vibes_preferences')->count());
    }

    public function test_memories_are_one_line_newest_first_and_limited_to_fifty(): void
    {
        $this->postJson('/api/vibes/memories', ['text' => "Uses Expo\n  and TypeScript."])->assertOk()
            ->assertJsonPath('memory.text', 'Uses Expo and TypeScript.')->assertJsonPath('limit', 50);
        $this->postJson('/api/vibes/memories', ['text' => 'Writes in British English.'])->assertOk()
            ->assertJsonPath('memories.0.text', 'Writes in British English.')
            ->assertJsonPath('memories.1.text', 'Uses Expo and TypeScript.');
        $this->postJson('/api/vibes/memories', ['text' => '   '])->assertStatus(422)->assertJsonPath('ok', false);
        $this->postJson('/api/vibes/memories', ['text' => str_repeat('a', 201)])->assertStatus(422);
        // Seeded through the store: the limit is what is under test, not 48 more requests.
        for ($i = 3; $i <= 50; $i++) app(Personalization::class)->remember($this->user->id, 'Saved fact number '.$i);
        $this->postJson('/api/vibes/memories', ['text' => 'One too many'])->assertStatus(422)
            ->assertExactJson(['ok' => false, 'error' => 'You can keep up to 50 memories. Remove one to add another.']);
        $this->assertCount(50, $this->getJson('/api/vibes/memories')->json('memories'));
    }

    public function test_removing_one_or_all_answers_with_what_is_left(): void
    {
        $first = $this->postJson('/api/vibes/memories', ['text' => 'First'])->json('memory.id');
        $this->postJson('/api/vibes/memories', ['text' => 'Second'])->assertOk();
        $this->deleteJson('/api/vibes/memories/'.$first)->assertOk()
            ->assertJsonCount(1, 'memories')->assertJsonPath('memories.0.text', 'Second');
        $this->deleteJson('/api/vibes/memories/'.$first)->assertStatus(404)
            ->assertExactJson(['ok' => false, 'error' => 'That memory was already removed.']);
        $this->deleteJson('/api/vibes/memories')->assertOk()->assertExactJson(['ok' => true, 'memories' => [], 'limit' => 50]);
    }

    public function test_one_account_can_neither_read_nor_remove_another_accounts_memories(): void
    {
        $theirs = $this->postJson('/api/vibes/memories', ['text' => 'Private detail'])->json('memory.id');
        $this->account('other-session');
        $this->withToken('other-session')->getJson('/api/vibes/memories')->assertJsonCount(0, 'memories');
        $this->withToken('other-session')->deleteJson('/api/vibes/memories/'.$theirs)->assertStatus(404);
        $this->withToken('other-session')->deleteJson('/api/vibes/memories')->assertOk();
        $this->assertSame(1, DB::table('vibes_memories')->where('user_id', $this->user->id)->count());
    }

    public function test_every_route_needs_a_session(): void
    {
        $this->flushHeaders();
        $this->getJson('/api/vibes/preferences')->assertStatus(401)->assertJsonPath('ok', false);
        $this->postJson('/api/vibes/memories', ['text' => 'x'])->assertStatus(401);
        $this->deleteJson('/api/vibes/memories/'.Str::uuid())->assertStatus(401);
    }

    public function test_a_guest_can_personalise_and_keeps_it_after_signing_up(): void
    {
        $this->flushHeaders();
        $guest = $this->postJson('/api/vibes/guest', ['installId' => 'install-a'])->assertOk();
        [$token, $id] = [$guest->json('token'), $guest->json('user.id')];
        $this->withToken($token)->postJson('/api/vibes/preferences', ['style' => 'friendly'])->assertOk();
        $this->withToken($token)->postJson('/api/vibes/memories', ['text' => 'Learning React Native.'])->assertOk();
        $this->withToken($token)->postJson('/api/auth/signup', ['email' => 'guest@example.com', 'password' => 'a-good-password'])
            ->assertStatus(201);
        // Sign-up converted the same row, so nothing had to move.
        $this->assertSame('guest@example.com', User::findOrFail($id)->email);
        $this->assertSame('friendly', DB::table('vibes_preferences')->where('user_id', $id)->value('style'));
        $this->assertSame(1, DB::table('vibes_memories')->where('user_id', $id)->count());
    }

    public function test_deleting_the_account_removes_its_preferences_and_memories(): void
    {
        $this->postJson('/api/vibes/preferences', ['style' => 'detailed'])->assertOk();
        $this->postJson('/api/vibes/memories', ['text' => 'Something'])->assertOk();
        $this->user->delete();
        $this->assertSame(0, DB::table('vibes_preferences')->count());
        $this->assertSame(0, DB::table('vibes_memories')->count());
    }
}
