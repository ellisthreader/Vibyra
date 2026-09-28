<?php

namespace Tests\Feature\Support\CodexResponses;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

trait CodexResponsesDynamicModelCases
{
    public function test_codex_responses_refreshes_the_catalog_for_a_new_dynamic_terminal_model(): void
    {
        Cache::forget((string) config('billing.openrouter_pricing.cache_key'));
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/models/user' => Http::response([
                'data' => [[
                    'id' => 'deepseek/deepseek-v4-flash',
                    'canonical_slug' => 'deepseek/deepseek-v4-flash',
                    'name' => 'DeepSeek V4 Flash',
                    'pricing' => [
                        'prompt' => '0.0000001',
                        'completion' => '0.0000004',
                    ],
                    'supported_parameters' => ['tools', 'reasoning'],
                ]],
            ]),
        ]);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([
            new GuzzleResponse(
                200,
                ['Content-Type' => 'application/json'],
                json_encode([
                    'id' => 'chat_dynamic',
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => 'Dynamic terminal ready.',
                        ],
                    ]],
                    'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 5],
                ])
            ),
        ]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_chat_client', new GuzzleClient(['handler' => $stack]));
        $token = $this->codexUserToken('dynamic-terminal-model@example.com');

        $response = $this->post('/api/codex/responses', [
            'model' => 'deepseek/deepseek-v4-flash',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $this->assertStringContainsString('Dynamic terminal ready.', $response->getContent());
        $this->assertStringContainsString('response.completed', $response->getContent());
        $this->assertCount(1, $history);
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('deepseek/deepseek-v4-flash', $payload['model'] ?? null);
        $this->assertFalse($payload['stream'] ?? true);
        $this->assertSame('Inspect this repository.', $payload['messages'][0]['content'] ?? null);
        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'deepseek/deepseek-v4-flash',
            'status' => 'settled',
        ]);
        Http::assertSentCount(1);
    }

    public function test_dynamic_terminal_chat_compatibility_preserves_tool_calls(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'qwen/qwen3.5-9b' => ['tools', 'reasoning'],
        ]);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([
            new GuzzleResponse(200, ['Content-Type' => 'application/json'], json_encode([
                'id' => 'chat_tool_call',
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_shell_1',
                            'type' => 'function',
                            'function' => [
                                'name' => 'shell',
                                'arguments' => '{"command":"pwd"}',
                            ],
                        ]],
                    ],
                ]],
                'usage' => ['prompt_tokens' => 30, 'completion_tokens' => 8],
            ])),
        ]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_chat_client', new GuzzleClient(['handler' => $stack]));
        $token = $this->codexUserToken('dynamic-tool-call@example.com');

        $response = $this->post('/api/codex/responses', [
            'model' => 'qwen/qwen3.5-9b',
            'input' => [
                ['role' => 'user', 'content' => [['type' => 'input_text', 'text' => 'Inspect the folder.']]],
                ['type' => 'function_call', 'id' => 'call_previous', 'name' => 'shell', 'arguments' => '{"command":"ls"}'],
                ['type' => 'function_call_output', 'id' => 'call_previous', 'output' => 'README.md'],
            ],
            'tools' => [[
                'type' => 'function',
                'name' => 'shell',
                'description' => 'Run a command',
                'parameters' => ['type' => 'object', 'properties' => []],
            ]],
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $content = $response->getContent();
        $this->assertStringContainsString('response.function_call_arguments.delta', $content);
        $this->assertStringContainsString('"call_id":"call_shell_1"', $content);
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('call_previous', $payload['messages'][1]['tool_calls'][0]['id'] ?? null);
        $this->assertSame('call_previous', $payload['messages'][2]['tool_call_id'] ?? null);
        $this->assertSame('shell', $payload['tools'][0]['function']['name'] ?? null);
    }
}
