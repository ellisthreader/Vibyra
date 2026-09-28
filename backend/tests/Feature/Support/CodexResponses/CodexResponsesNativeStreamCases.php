<?php

namespace Tests\Feature\Support\CodexResponses;

use App\Models\CreditLedger;
use App\Models\User;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;

trait CodexResponsesNativeStreamCases
{
    public function test_codex_responses_rejects_missing_auth(): void
    {
        $this->postJson('/api/codex/responses', ['stream' => true, 'input' => 'Hi'])
            ->assertUnauthorized();
    }

    public function test_codex_responses_proxies_native_stream_and_charges_usage(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $event = [
            'type' => 'response.completed',
            'response' => [
                'usage' => ['input_tokens' => 120, 'output_tokens' => 40],
            ],
        ];
        $stream = "event: response.completed\n".
            'data: '.json_encode($event)."\n\n";
        $mock = new MockHandler([
            new GuzzleResponse(200, ['Content-Type' => 'text/event-stream'], $stream),
        ]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Codex User',
            'email' => 'codex-responses@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'codex-responses@example.com')->update([
            'plan' => 'starter',
            'credits_balance' => 500,
        ]);

        $response = $this->post('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => [[
                'role' => 'user',
                'content' => [['type' => 'input_text', 'text' => 'Inspect the repository.']],
            ]],
            'tools' => [[
                'type' => 'function',
                'name' => 'shell',
                'description' => 'Run a command',
                'parameters' => ['type' => 'object'],
            ], [
                'type' => 'function',
                'name' => 'get_goal',
                'description' => 'Read the current goal',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [],
                    'required' => [],
                    'additionalProperties' => false,
                ],
            ]],
            'stream' => true,
            'store' => false,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $this->assertStringContainsString('response.completed', $response->streamedContent());
        $this->assertCount(1, $history);
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('openai/gpt-5.5', $payload['model'] ?? null);
        $this->assertTrue($payload['stream'] ?? false);
        $this->assertSame('shell', $payload['tools'][0]['name'] ?? null);
        $this->assertMatchesRegularExpression(
            '/"name":"get_goal".*?"properties":\{\}/s',
            (string) $history[0]['request']->getBody(),
        );
        $this->assertDatabaseHas('credit_ledger', [
            'kind' => 'chat',
            'model_key' => 'gpt-5.5',
        ]);
        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'gpt-5.5',
            'status' => 'settled',
        ]);
        $ledger = CreditLedger::first();
        $this->assertSame('desktop-terminal', $ledger?->meta['surface'] ?? null);
        $this->assertSame('success', $ledger?->meta['outcome'] ?? null);
        $this->assertSame('response.completed', $ledger?->meta['stream_terminal_type'] ?? null);
    }

    public function test_codex_responses_backfills_required_function_call_ids_from_item_ids(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $event = [
            'type' => 'response.completed',
            'response' => ['usage' => ['input_tokens' => 20, 'output_tokens' => 5]],
        ];
        $stack = HandlerStack::create(new MockHandler([
            new GuzzleResponse(
                200,
                ['Content-Type' => 'text/event-stream'],
                'data: '.json_encode($event)."\n\n"
            ),
        ]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->codexUserToken('function-call-ids@example.com');
        $response = $this->post('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => [
                [
                    'type' => 'function_call',
                    'id' => 'call_missing_link',
                    'name' => 'shell',
                    'arguments' => '{}',
                ],
                [
                    'type' => 'function_call_output',
                    'id' => 'call_output_missing_link',
                    'output' => 'done',
                ],
            ],
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $response->streamedContent();
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('call_missing_link', $payload['input'][0]['call_id'] ?? null);
        $this->assertSame('call_output_missing_link', $payload['input'][1]['call_id'] ?? null);
    }
}
