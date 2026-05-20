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

class VibyraChatCoreApiTest extends TestCase
{
    use RefreshDatabase;
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

    public function test_chat_mode_follow_up_in_game_project_does_not_generate_preview(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Use Space or tap the screen to shoot. <vibyra-app title="Wrong"><!doctype html><html><body>New build</body></html></vibyra-app>'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $prompt = implode("\n", [
            'Project context:',
            '- Product type: Game',
            '- Preferred framework/stack: Phaser',
            '- Stack reason: Reliable 2D browser game engine.',
            '- Workflow: create a concise internal plan, review it for missing pieces and risk, then implement it in the project files or runnable preview.',
            '- Output rule: prioritize code/project output over conversational explanation.',
            '',
            'User prompt: But whats the control to shoot?',
        ]);

        $this->postJson('/api/chat', [
            'history' => [
                ['role' => 'user', 'text' => 'make a webgl shooter game'],
                ['role' => 'assistant', 'text' => 'I built WebGL Shooter - tap the preview below to run it.'],
            ],
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'WebGL Shooter',
            'prompt' => $prompt,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Use Space or tap the screen to shoot.')
            ->assertJsonPath('app', null);

        Http::assertSent(function ($request) {
            $messages = $request['messages'];

            return $request['max_completion_tokens'] === 800
                && str_contains($messages[0]['content'], 'Be direct and concise')
                && ! str_contains($messages[0]['content'], 'Return only the <vibyra-app> block.');
        });
    }

    public function test_chat_sends_image_attachments_as_openrouter_content_parts(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'The screenshot shows a login form.'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.image-chat@example.com',
            'password' => 'secret123',
        ])->json('token');

        $image = 'data:image/png;base64,'.base64_encode("\x89PNG\r\n\x1a\nfake-png");

        $this->postJson('/api/chat', [
            'prompt' => 'What is in this image?',
            'model' => 'gpt-5.4-mini',
            'imageAttachments' => [[
                'url' => $image,
                'name' => 'login.png',
                'mimeType' => 'image/png',
            ]],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'The screenshot shows a login form.');

        Http::assertSent(function ($request) use ($image) {
            $content = $request['messages'][1]['content'] ?? null;

            return is_array($content)
                && ($content[0]['type'] ?? null) === 'text'
                && str_contains($content[0]['text'] ?? '', 'What is in this image?')
                && ($content[1]['type'] ?? null) === 'image_url'
                && ($content[1]['image_url']['url'] ?? null) === $image
                && ($content[1]['image_url']['detail'] ?? null) === 'auto';
        });
    }

    public function test_chat_rejects_invalid_image_attachment_data(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.bad-image-chat@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'prompt' => 'What is in this image?',
            'model' => 'gpt-5.4-mini',
            'imageAttachments' => [[
                'url' => 'data:image/svg+xml;base64,'.base64_encode('<svg></svg>'),
            ]],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)
            ->assertJsonPath('ok', false);

        Http::assertNothingSent();
    }
}
