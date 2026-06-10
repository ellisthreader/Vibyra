<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VibyraModerationTest extends TestCase
{
    use RefreshDatabase;

    public function test_community_comment_moderation_uses_local_filter_when_openai_is_unavailable(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/moderation', [
            'surface' => 'community.comment',
            'text' => 'This looks great and I want to try it.',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('moderation.blocked', false)
            ->assertJsonPath('moderation.warning', 'OpenAI moderation could not be reached; local comment filters were applied.');
    }

    public function test_community_comment_moderation_still_rejects_local_banned_content(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/moderation', [
            'surface' => 'community.comment',
            'text' => 'f.u.c.k this project',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('moderation.blocked', true)
            ->assertJsonPath('moderation.reason', 'pattern');

        Http::assertNothingSent();
    }

    public function test_local_comment_filter_stays_active_when_openai_moderation_is_disabled(): void
    {
        config([
            'moderation.remote_enabled' => false,
            'services.openai.key' => '',
        ]);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-local-only@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/moderation', [
            'surface' => 'community.comment',
            'text' => 'f.u.c.k this project',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('moderation.blocked', true)
            ->assertJsonPath('moderation.reason', 'pattern');

        Http::assertNothingSent();
    }

    public function test_comment_filter_does_not_block_harmless_substrings(): void
    {
        config([
            'moderation.remote_enabled' => false,
            'services.openai.key' => '',
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-analytics@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/moderation', [
            'surface' => 'community.comment',
            'text' => 'The analytics dashboard is useful and polished.',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('moderation.blocked', false);
    }

    public function test_community_comment_moderation_rejects_sexual_minor_and_obfuscated_non_pg_content(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $blockedExamples = [
            ['text' => 'f_ck this project', 'category' => 'profanity_obfuscation'],
            ['text' => '_igga', 'category' => 'hate_obfuscation'],
            ['text' => 'send nudes', 'category' => 'sexual_obfuscation'],
            ['text' => 'underage nudes', 'category' => 'sexual_minors'],
            ['text' => 'cp images', 'category' => 'sexual_minors'],
            ['text' => 's_e_x chat', 'category' => 'sexual_obfuscation'],
        ];

        foreach ($blockedExamples as $example) {
            $this->postJson('/api/moderation', [
                'surface' => 'community.comment',
                'text' => $example['text'],
            ], ['Authorization' => "Bearer {$token}"])
                ->assertUnprocessable()
                ->assertJsonPath('moderation.blocked', true)
                ->assertJsonPath('moderation.categories.0', $example['category']);
        }

        Http::assertNothingSent();
    }
}
