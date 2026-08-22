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

trait TestsChatStreamValidation
{
    public function test_chat_stream_rejects_missing_auth(): void
        {
            $this->postJson('/api/chat/stream', ['prompt' => 'Hi'])
                ->assertUnauthorized();
        }

    public function test_chat_stream_rejects_empty_prompt(): void
        {
            config(['services.openrouter.key' => 'test-openrouter-key']);
            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Stream User',
                'email' => 'stream@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat/stream', ['prompt' => ''], ['Authorization' => "Bearer {$token}"])
                ->assertStatus(422)
                ->assertJsonPath('error', 'Ask Vibyra something first.');
        }

    public function test_chat_stream_rejects_context_over_the_plan_cap_before_dispatch(): void
        {
            config([
                'services.openrouter.key' => 'test-openrouter-key',
                'billing.plans.free.context_token_cap' => 100,
            ]);
            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Stream Context User',
                'email' => 'stream-context@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat/stream', [
                'prompt' => str_repeat('context ', 100),
                'model' => 'gpt-5.4-mini',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertStatus(413)
                ->assertJsonPath('code', 'membership_context_limit');

            $this->assertDatabaseCount('chat_cost_reservations', 0);
        }

    public function test_chat_stream_rejects_unsupported_plan_model(): void
        {
            config(['services.openrouter.key' => 'test-openrouter-key']);
            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Stream User',
                'email' => 'streamer@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat/stream', [
                'prompt' => 'Hello',
                'model' => 'claude-opus-4',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertStatus(403)
                ->assertJsonPath('plan', 'free');
        }

    public function test_chat_stream_rejects_tool_only_model_without_matching_tool(): void
        {
            config(['services.openrouter.key' => 'test-openrouter-key']);
            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Stream User',
                'email' => 'stream-tool-only-model@example.com',
                'password' => 'secret123',
            ])->json('token');

            foreach (['tool-deep-research', 'tool-web-search', 'tool-analyze-files'] as $model) {
                $this->postJson('/api/chat/stream', [
                    'prompt' => "Use {$model} directly.",
                    'model' => $model,
                ], ['Authorization' => "Bearer {$token}"])
                    ->assertStatus(422)
                    ->assertJsonPath('error', 'This model is only available through its chat tool.');
            }
        }
}
