<?php

namespace Tests\Feature;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Tests\TestCase;

class VibyraLevelsAndModerationApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_level_activity_awards_idempotent_xp_and_milestone_credits(): void
    {
        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ]);
        $token = $signup->json('token');
        $startingCredits = (int) $signup->json('user.creditsBalance');
        $headers = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/level/activity', [
            'action' => 'coding_agent_completed',
            'contextId' => 'desktop-agent:run-1',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('xpDelta', 80)
            ->assertJsonPath('level.level', 1);

        $this->postJson('/api/level/activity', [
            'action' => 'coding_agent_completed',
            'contextId' => 'desktop-agent:run-1',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('duplicate', true)
            ->assertJsonPath('xpDelta', 0);

        $this->postJson('/api/level/activity', [
            'action' => 'coding_agent_completed',
            'contextId' => 'desktop-agent:run-2',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('xpDelta', 80)
            ->assertJsonPath('level.level', 2)
            ->assertJsonPath('user.creditsBalance', $startingCredits + 5);

        $this->assertDatabaseHas('credit_ledger', [
            'kind' => 'level_reward',
            'credits_delta' => 5,
            'reference' => 'level-reward:2',
        ]);
        $this->assertSame(2, DB::table('user_level_events')->where('action', 'coding_agent_completed')->count());
        $this->assertSame(1, DB::table('user_level_events')->where('action', 'daily_login')->count());
    }

    public function test_chat_does_not_call_openai_moderation(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => true,
                    'categories' => ['harassment' => true],
                    'category_scores' => ['harassment' => 0.98],
                ]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Chat response.'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'prompt' => 'Please review this public comment.',
            'model' => 'gpt-5.4-mini',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Chat response.');

        Http::assertNotSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/moderations');
        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions');
    }

    public function test_desktop_agent_chat_does_not_call_openai_moderation(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $desktopState = app(VibyraDesktopState::class)->state();
        $prompt = str_repeat('Build ', 1801);

        $this->postJson('/agents/start', [
            'projectId' => (string) ($desktopState['projects'][0]['id'] ?? ''),
            'prompt' => $prompt,
            'model' => 'gpt-5.5',
            'reasoningEffort' => 'medium',
        ], ['Authorization' => 'Bearer '.$desktopState['token']])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'Prompt is too long. Keep it under 8,000 characters.');

        Http::assertNothingSent();
    }
}
