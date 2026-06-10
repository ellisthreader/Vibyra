<?php

namespace Tests\Feature;

use App\Models\ChatCostReservation;
use App\Models\CreditLedger;
use App\Models\User;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VibyraCodexResponsesApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setTerminalModelCapabilities([
            'openai/gpt-5.5' => ['tools'],
        ]);
    }

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

    public function test_codex_responses_records_non_success_stream_terminal_states(): void
    {
        foreach ([
            ['response.failed', 'failed', ['input_tokens' => 30, 'output_tokens' => 5], false],
            ['response.incomplete', 'incomplete', ['input_tokens' => 30, 'output_tokens' => 5], false],
            ['error', 'error', null, true],
        ] as $index => [$terminalType, $outcome, $usage, $useEventName]) {
            config(['services.openrouter.key' => 'test-openrouter-key']);
            $event = $useEventName ? ['error' => ['message' => 'Stream failed.']] : ['type' => $terminalType];
            if ($usage !== null) {
                $event['response'] = ['usage' => $usage];
            }
            $stream = ($useEventName ? "event: {$terminalType}\n" : '').
                'data: '.json_encode($event)."\n\n";
            app()->instance(
                'vibyra.openrouter_responses_client',
                new GuzzleClient(['handler' => HandlerStack::create(new MockHandler([
                    new GuzzleResponse(
                        200,
                        ['Content-Type' => 'text/event-stream'],
                        $stream
                    ),
                ]))])
            );

            $token = $this->codexUserToken("terminal-state-{$index}@example.com");
            $response = $this->post('/api/codex/responses', [
                'model' => 'gpt-5.5',
                'input' => 'Inspect this repository.',
                'stream' => true,
            ], ['Authorization' => "Bearer {$token}"]);

            $response->assertOk();
            $response->streamedContent();
            $ledger = CreditLedger::latest('id')->first();
            $this->assertSame($outcome, $ledger?->meta['outcome'] ?? null);
            $this->assertSame($terminalType, $ledger?->meta['stream_terminal_type'] ?? null);
            $this->assertSame($terminalType, $ledger?->meta['attempts'][0]['outcome'] ?? null);
        }
    }

    public function test_codex_responses_does_not_record_eof_without_terminal_event_as_success(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        app()->instance(
            'vibyra.openrouter_responses_client',
            new GuzzleClient(['handler' => HandlerStack::create(new MockHandler([
                new GuzzleResponse(200, ['Content-Type' => 'text/event-stream'], "data: {\"type\":\"response.created\"}\n\n"),
            ]))])
        );

        $token = $this->codexUserToken('missing-terminal@example.com');
        $response = $this->post('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $response->streamedContent();
        $ledger = CreditLedger::latest('id')->first();
        $this->assertSame('error', $ledger?->meta['outcome'] ?? null);
        $this->assertSame(
            'stream_ended_without_terminal',
            $ledger?->meta['stream_terminal_type'] ?? null
        );
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

    public function test_codex_responses_enforces_monthly_cost_limit_before_provider_dispatch(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Capped Codex User',
            'email' => 'capped-codex@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'capped-codex@example.com')->update([
            'plan' => 'starter',
            'credits_balance' => 500,
            'openrouter_spend_period' => now('UTC')->format('Y-m'),
            'openrouter_spent_micro_usd' => 4_990_000,
        ]);

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertBadRequest()
            ->assertJsonPath('error.message', 'Monthly AI cost limit reached. Upgrade your plan or wait for the next billing month.')
            ->assertJsonPath('error.code', 'billing_monthly_usd_cap')
            ->assertJsonPath('error.details.billingStatus', 429);

        $this->assertCount(0, $history);
    }

    public function test_codex_responses_returns_non_retryable_burst_limit_details(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'openai/gpt-5.4-mini' => ['tools'],
        ]);
        $resetAt = now()->addHours(2)->startOfSecond();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Burst Capped Codex User',
            'email' => 'burst-capped-codex@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'burst-capped-codex@example.com')->update([
            'plan' => 'free',
            'credits_balance' => 37,
            'burst_credits_used' => 15,
            'burst_credits_reset_at' => $resetAt,
            'weekly_credits_used' => 13,
            'weekly_credits_reset_at' => now()->addDays(6),
        ]);

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.4-mini',
            'input' => str_repeat('Inspect this repository carefully. ', 500),
            'max_output_tokens' => 2000,
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertBadRequest()
            ->assertJsonPath('error.code', 'billing_burst_cap')
            ->assertJsonPath('error.details.creditsUsed', 15)
            ->assertJsonPath('error.details.creditsCap', 15)
            ->assertJsonPath('error.details.billingStatus', 429)
            ->assertJsonPath('error.details.resetAt', $resetAt->toIso8601String());
    }

    public function test_gemini_terminal_uses_realistic_burst_quota_with_conservative_balance_hold(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'google/gemini-3.5-flash' => ['tools'],
        ]);
        $history = [];
        $event = [
            'type' => 'response.completed',
            'response' => [
                'usage' => [
                    'input_tokens' => 12_500,
                    'output_tokens' => 100,
                    'cost' => 0.02,
                ],
            ],
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

        $token = $this->codexUserToken('gemini-realistic-burst@example.com');
        User::where('email', 'gemini-realistic-burst@example.com')->update([
            'plan' => 'free',
            'credits_balance' => 24,
            'burst_credits_used' => 12,
            'burst_credits_reset_at' => now()->addHours(4),
            'weekly_credits_used' => 26,
            'weekly_credits_reset_at' => now()->addDays(6),
        ]);

        $response = $this->post('/api/codex/responses', [
            'model' => 'google/gemini-3.5-flash',
            'input' => [[
                'role' => 'user',
                'content' => [[
                    'type' => 'input_text',
                    'text' => str_repeat('Gemini terminal context. ', 2000),
                ]],
            ]],
            'max_output_tokens' => 2000,
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $response->streamedContent();
        $this->assertCount(1, $history);
        $reservation = ChatCostReservation::latest('id')->firstOrFail();
        $this->assertGreaterThan(
            $reservation->meta['quota_reserved_credits'],
            $reservation->reserved_credits
        );
        $this->assertSame(3, $reservation->meta['quota_reserved_credits']);
    }

    public function test_codex_responses_rejects_models_outside_the_plan(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Free Codex User',
            'email' => 'free-codex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertForbidden()
            ->assertJsonPath('error.message', 'Your Vibyra plan does not include this terminal model.');
    }

    public function test_codex_responses_surfaces_nested_provider_error_details(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        app()->instance(
            'vibyra.openrouter_responses_client',
            new GuzzleClient([
                'http_errors' => false,
                'handler' => HandlerStack::create(new MockHandler([
                    new GuzzleResponse(400, ['Content-Type' => 'application/json'], json_encode([
                        'error' => [
                            'message' => 'Provider returned error',
                            'metadata' => [
                                'raw' => json_encode([
                                    'error' => ['message' => 'Unsupported terminal tool schema.'],
                                ]),
                            ],
                        ],
                    ])),
                ])),
            ])
        );

        $token = $this->codexUserToken('provider-detail@example.com');

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertBadRequest()
            ->assertJsonPath('error.message', 'Unsupported terminal tool schema.');
    }

    public function test_codex_responses_rejects_unknown_model_before_reservation_or_dispatch(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->codexUserToken('unknown-terminal-model@example.com');

        $this->postJson('/api/codex/responses', [
            'model' => 'not-a-real-model',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('error.message', 'Unknown Vibyra terminal model.');

        $this->assertCount(0, $history);
        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

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
        $token = $this->codexUserToken('dynamic-terminal-model@example.com');

        $response = $this->post('/api/codex/responses', [
            'model' => 'deepseek/deepseek-v4-flash',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $response->streamedContent();
        $this->assertCount(1, $history);
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('deepseek/deepseek-v4-flash', $payload['model'] ?? null);
        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'deepseek/deepseek-v4-flash',
            'status' => 'settled',
        ]);
        Http::assertSentCount(1);
    }

    public function test_codex_responses_rejects_chat_only_model_before_reservation_or_dispatch(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'openai/gpt-5.5' => ['reasoning'],
        ]);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->codexUserToken('chat-only-terminal-model@example.com');

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => 'Inspect this repository.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('error.message', 'This model does not support terminal tool calling.');

        $this->assertCount(0, $history);
        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    public function test_codex_responses_rejects_chat_only_model_resolved_by_literal_auto(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'openai/gpt-5.5' => ['reasoning'],
        ]);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_responses_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->codexUserToken('auto-chat-only-terminal-model@example.com');

        $this->postJson('/api/codex/responses', [
            'model' => 'auto',
            'input' => 'Implement the API and tests.',
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('error.message', 'This model does not support terminal tool calling.');

        $this->assertCount(0, $history);
        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    private function codexUserToken(string $email): string
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Codex User',
            'email' => $email,
            'password' => 'secret123',
        ])->json('token');
        User::where('email', $email)->update([
            'plan' => 'starter',
            'credits_balance' => 500,
        ]);

        return $token;
    }

    private function setTerminalModelCapabilities(array $models): void
    {
        $catalog = [];
        foreach ($models as $slug => $supportedParameters) {
            $catalog[$slug] = [
                'pricing' => [],
                'supported_parameters' => $supportedParameters,
            ];
        }

        Cache::put(
            (string) config('billing.openrouter_pricing.cache_key', 'billing:openrouter-pricing:v1'),
            [
                'synced_at' => now()->toIso8601String(),
                'models' => $catalog,
            ],
            now()->addHour(),
        );
    }
}
