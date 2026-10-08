<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PromptLibrary\PromptLibrary;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PromptLibrarySyncTest extends TestCase
{
    use RefreshDatabase;

    private array $headers = [];

    protected function setUp(): void
    {
        parent::setUp();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Prompt User',
            'email' => 'prompts@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $this->headers = ['Authorization' => "Bearer {$token}"];
    }

    private function prompt(string $id, string $text, string $at, array $extra = []): array
    {
        return ['id' => $id, 'title' => "Title {$id}", 'text' => $text, 'updatedAt' => $at, ...$extra];
    }

    private function sync(array $prompts, array $more = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/session/state', [
            'appState' => ['promptLibrary' => ['prompts' => $prompts], ...$more],
        ], $this->headers)->assertOk();
    }

    public function test_the_library_is_off_by_default_and_the_key_is_ignored(): void
    {
        $this->sync([$this->prompt('a', 'Review {{project}}', '2026-10-01T10:00:00.000Z')])
            ->assertJsonPath('promptLibrary.enabled', false)
            ->assertJsonPath('promptLibrary.prompts', []);

        $this->assertArrayNotHasKey('promptLibrary', User::query()->firstOrFail()->app_state ?? []);
    }

    public function test_a_device_gets_back_the_merge_of_every_device(): void
    {
        config(['prompt_library.enabled' => true]);
        $this->sync([$this->prompt('a', 'Review {{project}}', '2026-10-01T10:00:00.000Z')])
            ->assertJsonPath('promptLibrary.enabled', true)
            ->assertJsonCount(1, 'promptLibrary.prompts');

        $second = $this->sync([$this->prompt('b', 'Plan {{date}}', '2026-10-01T11:00:00Z')])->json('promptLibrary.prompts');
        $this->assertEqualsCanonicalizing(['a', 'b'], array_column($second, 'id'));
        // One canonical UTC format on the way out, whatever the device sent.
        $this->assertSame('2026-10-01T11:00:00.000Z', collect($second)->firstWhere('id', 'b')['updatedAt']);

        $empty = $this->sync([])->json('promptLibrary.prompts');
        $this->assertCount(2, $empty);
    }

    public function test_an_older_copy_never_overwrites_a_newer_one(): void
    {
        config(['prompt_library.enabled' => true]);
        $this->sync([$this->prompt('a', 'new words', '2026-10-02T10:00:00.000Z')]);

        $kept = $this->sync([$this->prompt('a', 'old words', '2026-10-01T10:00:00.000Z')])->json('promptLibrary.prompts');

        $this->assertSame('new words', $kept[0]['text']);
    }

    public function test_a_deletion_beats_an_older_edit_and_wins_a_tie(): void
    {
        config(['prompt_library.enabled' => true]);
        $this->sync([$this->prompt('a', 'words', '2026-10-01T10:00:00.000Z')]);
        $gone = ['id' => 'a', 'title' => '', 'text' => '', 'updatedAt' => '2026-10-02T09:00:00.000Z', 'deletedAt' => '2026-10-02T09:00:00.000Z'];
        $this->sync([$gone]);

        $after = $this->sync([$this->prompt('a', 'edited elsewhere', '2026-10-02T08:00:00.000Z')])->json('promptLibrary.prompts');
        $this->assertCount(1, $after);
        $this->assertSame('2026-10-02T09:00:00.000Z', $after[0]['deletedAt']);
        $this->assertSame('', $after[0]['text']);

        $tie = $this->sync([$this->prompt('a', 'same instant', '2026-10-02T09:00:00.000Z')])->json('promptLibrary.prompts');
        $this->assertArrayHasKey('deletedAt', $tie[0]);
    }

    public function test_other_app_state_and_stale_syncs_without_the_key_are_untouched(): void
    {
        config(['prompt_library.enabled' => true]);
        $this->sync([$this->prompt('a', 'words', '2026-10-01T10:00:00.000Z')], ['selectedChatModel' => 'gpt-5.4-mini']);

        $this->postJson('/api/session/state', ['appState' => ['selectedChatModel' => 'other']], $this->headers)
            ->assertOk()
            ->assertJsonCount(1, 'promptLibrary.prompts');

        $state = User::query()->firstOrFail()->app_state;
        $this->assertSame('other', $state['selectedChatModel']);
        $this->assertSame('words', $state['promptLibrary']['prompts'][0]['text']);
    }

    public function test_malformed_prompts_are_dropped_and_limits_applied(): void
    {
        $library = new PromptLibrary();
        $at = '2026-10-01T10:00:00.000Z';
        $clean = $library->normalize([
            ['id' => 'bad id!', 'title' => 'x', 'text' => 'y', 'updatedAt' => $at],
            ['id' => 'nodate', 'title' => 'x', 'text' => 'y'],
            ['id' => 'empty', 'title' => '  ', 'text' => 'y', 'updatedAt' => $at],
            ['id' => 'blank', 'title' => 'x', 'text' => " \n", 'updatedAt' => $at],
            'junk',
            ['id' => 'long', 'title' => str_repeat('t', 90), 'text' => str_repeat('é', 3000), 'updatedAt' => $at],
        ]);

        $this->assertCount(1, $clean);
        $this->assertSame(PromptLibrary::MAX_TITLE, mb_strlen($clean[0]['title']));
        $this->assertSame(PromptLibrary::MAX_TEXT, mb_strlen($clean[0]['text']));
    }

    public function test_only_the_newest_fifty_prompts_and_recent_tombstones_are_kept(): void
    {
        $library = new PromptLibrary();
        $now = CarbonImmutable::parse('2026-10-02T12:00:00Z');
        $many = [];
        for ($i = 0; $i < 55; $i++) {
            $many[] = $this->prompt("p{$i}", 'words', $now->subMinutes(60 - $i)->format('Y-m-d\TH:i:s.v\Z'));
        }
        $old = $now->subDays(91)->format('Y-m-d\TH:i:s.v\Z');
        $fresh = $now->subDays(2)->format('Y-m-d\TH:i:s.v\Z');
        $tombstones = [
            ['id' => 'old', 'title' => '', 'text' => '', 'updatedAt' => $old, 'deletedAt' => $old],
            ['id' => 'fresh', 'title' => '', 'text' => '', 'updatedAt' => $fresh, 'deletedAt' => $fresh],
        ];

        $merged = $library->merge($many, $tombstones, $now);
        $ids = array_column($merged, 'id');

        $this->assertCount(51, $merged);
        $this->assertContains('fresh', $ids);
        $this->assertNotContains('old', $ids);
        $this->assertNotContains('p0', $ids);
        $this->assertContains('p54', $ids);
    }
}
