<?php

namespace Tests\Feature;

use App\Services\VibyraDesktopState;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VibyraAppApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_email_signup_creates_free_account_and_persists_state(): void
    {
        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ]);

        $token = $signup
            ->assertCreated()
            ->assertJsonPath('user.plan', 'free')
            ->assertJsonPath('user.creditsBalance', 50)
            ->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/onboarding/complete', [], $headers)
            ->assertOk()
            ->assertJsonPath('user.onboardingComplete', true);

        $this->postJson('/api/session/state', [
            'rememberedDesktops' => [[
                'url' => 'http://127.0.0.1:4317',
                'pairCode' => 'ABCD12',
                'machineName' => 'Vibyra Desktop',
                'status' => 'online',
            ]],
            'appState' => ['selectedChatModel' => 'gpt-5.4-mini'],
        ], $headers)
            ->assertOk()
            ->assertJsonPath('user.rememberedDesktops.0.pairCode', 'ABCD12');
    }

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

            return $request['model'] === 'openai/gpt-4o-mini'
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

    public function test_desktop_agent_does_not_fall_back_to_first_project_for_unknown_project_id(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Should not run.'],
                ]],
            ]),
        ]);

        $desktopState = app(VibyraDesktopState::class)->state();

        $this->postJson('/agents/start', [
            'projectId' => 'missing-project-id',
            'prompt' => 'Build a landing page',
            'model' => 'gpt-5.5',
            'reasoningEffort' => 'medium',
        ], ['Authorization' => 'Bearer '.$desktopState['token']])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'No project selected');

        Http::assertNothingSent();
    }
}
