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

trait TestsChatCoreRouting
{
    public function test_chat_uses_openrouter_and_deducts_credits(): void
        {
            config(['services.openrouter.key' => 'test-openrouter-key']);
            Http::fake([
                'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                    'choices' => [[
                        'message' => ['content' => 'Here is the answer.'],
                    ]],
                ]),
            ]);

            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Alex Carter',
                'email' => 'alex@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat', [
                'history' => [
                    ['role' => 'user', 'text' => 'The login screen is too generic.'],
                    ['role' => 'assistant', 'text' => 'I can make it more specific to your app.'],
                ],
                'prompt' => 'Help me ship this feature.',
                'model' => 'gpt-5.4-mini',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('reply', 'Here is the answer.')
                ->assertJsonPath('creditCost', 1)
                ->assertJsonPath('creditsBalance', 49)
                ->assertJsonPath('creditsUsed', 1);

            Http::assertSent(function ($request) {
                $messages = $request['messages'];

                return $request['model'] === 'openai/gpt-5.4-mini'
                    && $request['max_completion_tokens'] === 800
                    && ! array_key_exists('max_tokens', $request->data())
                    && $messages[1]['role'] === 'user'
                    && $messages[1]['content'] === 'The login screen is too generic.'
                    && $messages[2]['role'] === 'assistant'
                    && $messages[2]['content'] === 'I can make it more specific to your app.'
                    && $messages[3]['role'] === 'user'
                    && str_contains($messages[3]['content'], 'Help me ship this feature.');
            });
            Http::assertNotSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/moderations');
        }

    public function test_auto_routes_each_prompt_and_reports_the_selected_model(): void
        {
            config(['services.openrouter.key' => 'test-openrouter-key']);
            Http::fake([
                'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                    'choices' => [[
                        'message' => ['content' => 'The interface is ready.'],
                    ]],
                    'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 8, 'cost' => 0.001],
                ]),
            ]);

            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Auto User',
                'email' => 'auto-router@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat', [
                'prompt' => 'Build a responsive 3D frontend with polished CSS animations.',
                'model' => 'auto',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('modelKey', 'gpt-5.4-mini')
                ->assertJsonPath('requestedModelKey', 'auto')
                ->assertJsonPath('autoRouting.category', 'visual_frontend')
                ->assertJsonPath('autoRouting.preferredModelKey', 'google/gemini-3.1-pro-preview');

            Http::assertSent(fn ($request) => $request['model'] === 'openai/gpt-5.4-mini');
        }

    public function test_auto_terminal_route_selects_a_model_without_calling_a_provider(): void
        {
            Http::fake();

            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Auto Terminal User',
                'email' => 'auto-terminal-router@example.com',
                'password' => 'secret123',
            ])->json('token');

            $this->postJson('/api/chat/route', [
                'prompt' => 'Fix this TypeScript API and run its tests.',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('modelKey', 'gpt-5.4-mini')
                ->assertJsonPath('autoRouting.category', 'agentic_coding')
                ->assertJsonPath('autoRouting.preferredModelKey', 'openai/gpt-5.6-terra');

            Http::assertNothingSent();
        }

    public function test_paid_auto_route_uses_the_preferred_frontend_model(): void
        {
            config(['services.openrouter.key' => 'test-openrouter-key']);
            Http::fake([
                'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                    'choices' => [[
                        'message' => ['content' => 'The interface is ready.'],
                    ]],
                    'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 8, 'cost' => 0.001],
                ]),
            ]);

            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Paid Auto User',
                'email' => 'paid-auto-router@example.com',
                'password' => 'secret123',
            ])->json('token');
            User::where('email', 'paid-auto-router@example.com')->update([
                'plan' => 'starter',
                'credits_balance' => 500,
            ]);

            $this->postJson('/api/chat', [
                'prompt' => 'Desktop profile context and memory',
                'routingPrompt' => 'Build a responsive frontend from this screenshot.',
                'model' => 'auto',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('modelKey', 'google/gemini-3.1-pro-preview')
                ->assertJsonPath('autoRouting.category', 'visual_frontend');

            Http::assertSent(fn ($request) => $request['model'] === 'google/gemini-3.1-pro-preview');
        }
}
