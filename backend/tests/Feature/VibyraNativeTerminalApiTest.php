<?php

namespace Tests\Feature;

use App\Models\User;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class VibyraNativeTerminalApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::put(
            (string) config('billing.openrouter_pricing.cache_key'),
            [
                'synced_at' => now()->toIso8601String(),
                'models' => [
                    'anthropic/claude-sonnet-4.6' => [
                        'pricing' => [], 'supported_parameters' => ['tools'],
                    ],
                    'anthropic/claude-haiku-4.5' => [
                        'pricing' => [], 'supported_parameters' => ['tools'],
                    ],
                    'google/gemini-3.5-flash' => [
                        'pricing' => [], 'supported_parameters' => ['tools'],
                    ],
                ],
            ],
            now()->addHour(),
        );
        config(['services.openrouter.key' => 'test-openrouter-key']);
    }

    public function test_anthropic_terminal_proxies_native_messages_stream_and_settles(): void
    {
        $history = [];
        $stream = "event: message_start\n".
            'data: {"type":"message_start","message":{"usage":{"input_tokens":30}}}'."\n\n".
            "event: message_delta\n".
            'data: {"type":"message_delta","usage":{"output_tokens":8}}'."\n\n".
            "event: message_stop\n".
            'data: {"type":"message_stop"}'."\n\n";
        $this->bindNativeClient($history, $stream);
        $token = $this->terminalUserToken('native-claude@example.com');

        $response = $this->post('/api/terminal/anthropic/messages', [
            'model' => 'claude-sonnet-4.6',
            'messages' => [['role' => 'user', 'content' => 'Inspect this repository.']],
            'tools' => [['name' => 'shell', 'input_schema' => ['type' => 'object']]],
            'max_tokens' => 1000,
            'stream' => true,
            '_vibyraHeaders' => ['anthropic-version' => '2023-06-01'],
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $this->assertStringContainsString('message_stop', $response->streamedContent());
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('anthropic/claude-sonnet-4.6', $payload['model']);
        $this->assertTrue($payload['stream']);
        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'anthropic/claude-sonnet-4.6',
            'status' => 'settled',
        ]);
    }

    public function test_gemini_terminal_translates_streaming_tools_and_usage(): void
    {
        $history = [];
        $stream = 'data: {"choices":[{"delta":{"content":"Checking."},"finish_reason":null}]}'."\n\n".
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"shell","arguments":"{\\"command\\":\\"pwd\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":20,"completion_tokens":6}}'."\n\n".
            "data: [DONE]\n\n";
        $this->bindNativeClient($history, $stream);
        $token = $this->terminalUserToken('native-gemini@example.com');

        $response = $this->post(
            '/api/terminal/gemini/models/gemini-3.5-flash/streamGenerateContent',
            [
                'contents' => [[
                    'role' => 'user',
                    'parts' => [['text' => 'Inspect this repository.']],
                ]],
                'tools' => [[
                    'functionDeclarations' => [[
                        'name' => 'shell',
                        'description' => 'Run a command',
                        'parameters' => ['type' => 'object'],
                    ]],
                ]],
                'generationConfig' => ['maxOutputTokens' => 1000],
            ],
            ['Authorization' => "Bearer {$token}"]
        );

        $response->assertOk();
        $content = $response->streamedContent();
        $this->assertStringContainsString('"text":"Checking."', $content);
        $this->assertStringContainsString('"functionCall"', $content);
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('google/gemini-3.5-flash', $payload['model']);
        $this->assertSame('shell', $payload['tools'][0]['function']['name']);
        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'google/gemini-3.5-flash',
            'status' => 'settled',
        ]);
    }

    public function test_native_terminal_count_routes_require_auth_without_billing(): void
    {
        $this->postJson('/api/terminal/anthropic/messages/count_tokens', [])
            ->assertUnauthorized();
        $token = $this->terminalUserToken('native-count@example.com');
        $this->postJson(
            '/api/terminal/gemini/models/gemini-3.5-flash/countTokens',
            ['contents' => [['parts' => [['text' => 'Hello']]]]],
            ['Authorization' => "Bearer {$token}"]
        )->assertOk()->assertJsonStructure(['totalTokens']);
        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    public function test_native_routes_reject_cross_provider_models(): void
    {
        $token = $this->terminalUserToken('native-provider-lock@example.com');

        $this->postJson('/api/terminal/anthropic/messages', [
            'model' => 'google/gemini-3.5-flash',
            'messages' => [['role' => 'user', 'content' => 'Hello']],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)
            ->assertJsonPath('error.type', 'invalid_request_error');
    }

    public function test_free_plan_cannot_use_a_premium_native_terminal_model(): void
    {
        $token = $this->terminalUserToken('native-plan-lock@example.com');
        User::where('email', 'native-plan-lock@example.com')->update([
            'plan' => 'free',
            'credits_balance' => 500,
        ]);

        $this->postJson('/api/terminal/anthropic/messages', [
            'model' => 'claude-sonnet-4.6',
            'messages' => [['role' => 'user', 'content' => 'Inspect this repository.']],
            'max_tokens' => 800,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertForbidden()
            ->assertJsonPath('error.message', 'Your Vibyra plan does not include this terminal model.');
    }

    public function test_native_terminal_rejects_context_over_the_plan_cap_before_reservation(): void
    {
        config([
            'billing.plans.starter.context_token_cap' => 1,
        ]);
        $token = $this->terminalUserToken('native-context-limit@example.com');

        $this->postJson('/api/terminal/anthropic/messages', [
            'model' => 'claude-haiku-4.5',
            'messages' => [['role' => 'user', 'content' => 'Inspect this repository.']],
            'max_tokens' => 1,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(413)
            ->assertJsonPath('error.code', 'membership_context_limit');

        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    public function test_native_terminal_forwards_the_context_clipped_output_limit(): void
    {
        config(['billing.plans.starter.context_token_cap' => 300]);
        $history = [];
        $this->bindNativeClient($history, json_encode([
            'id' => 'msg_1',
            'type' => 'message',
            'content' => [['type' => 'text', 'text' => 'Done.']],
            'usage' => ['input_tokens' => 20, 'output_tokens' => 4],
        ]));
        $token = $this->terminalUserToken('native-context-clip@example.com');

        $this->postJson('/api/terminal/anthropic/messages', [
            'model' => 'claude-haiku-4.5',
            'messages' => [['role' => 'user', 'content' => 'Inspect this repository.']],
            'max_tokens' => 1000,
        ], ['Authorization' => "Bearer {$token}"])->assertOk();

        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertGreaterThan(0, $payload['max_tokens']);
        $this->assertLessThan(300, $payload['max_tokens']);
    }

    public function test_plan_downgrade_blocks_premium_model_on_the_next_request(): void
    {
        $token = $this->terminalUserToken('native-downgrade-lock@example.com');
        User::where('email', 'native-downgrade-lock@example.com')->update([
            'plan' => 'free',
            'credits_balance' => 500,
        ]);

        $this->postJson('/api/terminal/anthropic/messages', [
            'model' => 'claude-sonnet-4.6',
            'messages' => [['role' => 'user', 'content' => 'Inspect this repository.']],
            'max_tokens' => 800,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertForbidden()
            ->assertJsonPath('error.message', 'Your Vibyra plan does not include this terminal model.');

        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    public function test_native_billing_limits_are_non_retryable_and_keep_details(): void
    {
        $token = $this->terminalUserToken('native-billing-limit@example.com');
        User::where('email', 'native-billing-limit@example.com')->update([
            'plan' => 'free',
            'burst_credits_used' => 15,
            'burst_credits_reset_at' => now()->addHour(),
        ]);

        $this->postJson('/api/terminal/anthropic/messages', [
            'model' => 'claude-haiku-4.5',
            'messages' => [['role' => 'user', 'content' => 'Hello']],
            'max_tokens' => 800,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(400)
            ->assertJsonPath('error.type', 'invalid_request_error')
            ->assertJsonPath('error.code', 'billing_burst_cap')
            ->assertJsonPath('error.details.billingStatus', 429);
    }

    private function bindNativeClient(array &$history, string $stream): void
    {
        $stack = HandlerStack::create(new MockHandler([
            new GuzzleResponse(200, ['Content-Type' => 'text/event-stream'], $stream),
        ]));
        $stack->push(Middleware::history($history));
        app()->instance(
            'vibyra.openrouter_native_terminal_client',
            new GuzzleClient(['handler' => $stack])
        );
    }

    private function terminalUserToken(string $email): string
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Terminal User',
            'email' => $email,
            'password' => 'secret123',
        ])->json('token');
        User::where('email', $email)->update([
            'plan' => 'starter',
            'credits_balance' => 500,
        ]);
        return $token;
    }
}
