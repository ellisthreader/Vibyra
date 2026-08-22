<?php

namespace Tests\Feature\Concerns\NextTen;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;

trait TestsChatCoreEntitlements
{
    public function test_session_payload_exposes_authoritative_membership_limits(): void
        {
            $response = $this->postJson('/api/auth/signup', [
                'name' => 'Limit User',
                'email' => 'membership-limits@example.com',
                'password' => 'secret123',
            ]);

            $response->assertCreated()
                ->assertJsonPath('user.maxConcurrentAgents', 0)
                ->assertJsonPath('user.maxActiveProjects', 1)
                ->assertJsonPath('user.contextTokenCap', 16000);
        }

    public function test_chat_rejects_context_over_the_plan_cap_before_dispatch(): void
        {
            config([
                'services.openrouter.key' => 'test-openrouter-key',
                'billing.plans.free.context_token_cap' => 100,
            ]);
            Http::fake();
            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Context User',
                'email' => 'context-limit@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat', [
                'prompt' => str_repeat('context ', 100),
                'model' => 'gpt-5.4-mini',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertStatus(413)
                ->assertJsonPath('code', 'membership_context_limit')
                ->assertJsonPath('contextTokenCap', 100);

            Http::assertNothingSent();
            $this->assertDatabaseCount('chat_cost_reservations', 0);
        }

    public function test_chat_clips_output_to_remaining_plan_context(): void
        {
            config([
                'services.openrouter.key' => 'test-openrouter-key',
                'billing.plans.free.context_token_cap' => 500,
            ]);
            Http::fake([
                'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                    'choices' => [['message' => ['content' => 'Clipped safely.']]],
                ]),
            ]);
            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Context Clip User',
                'email' => 'context-clip@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat', [
                'prompt' => 'Hello',
                'model' => 'gpt-5.4-mini',
            ], ['Authorization' => "Bearer {$token}"])->assertOk();

            Http::assertSent(fn ($request) => (
                ($request['max_completion_tokens'] ?? 0) > 0
                && ($request['max_completion_tokens'] ?? 0) < 500
            ));
        }
}
