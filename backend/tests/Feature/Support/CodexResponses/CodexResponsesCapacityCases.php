<?php

namespace Tests\Feature\Support\CodexResponses;

use App\Models\ChatCostReservation;
use App\Models\User;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;

trait CodexResponsesCapacityCases
{
    public function test_gemini_terminal_uses_realistic_burst_quota_with_conservative_balance_hold(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'google/gemini-3.5-flash' => ['tools'],
        ]);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([
            new GuzzleResponse(
                200,
                ['Content-Type' => 'application/json'],
                json_encode([
                    'id' => 'chat_gemini_quota',
                    'choices' => [[
                        'message' => [
                            'role' => 'assistant',
                            'content' => 'Gemini terminal ready.',
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 12_500,
                        'completion_tokens' => 100,
                        'cost' => 0.02,
                    ],
                ])
            ),
        ]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_chat_client', new GuzzleClient(['handler' => $stack]));

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
        $this->assertStringContainsString('Gemini terminal ready.', $response->getContent());
        $this->assertCount(1, $history);
        $reservation = ChatCostReservation::latest('id')->firstOrFail();
        $this->assertGreaterThan(
            $reservation->meta['quota_reserved_credits'],
            $reservation->reserved_credits
        );
        $this->assertSame(3, $reservation->meta['quota_reserved_credits']);
    }

    public function test_terminal_reduces_output_cap_to_fit_remaining_credit_balance(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $this->setTerminalModelCapabilities([
            'x-ai/grok-build-0.1' => [
                'supported_parameters' => ['tools'],
                'pricing' => ['prompt' => '0.000001', 'completion' => '0.000002'],
            ],
        ]);
        $history = [];
        $stack = HandlerStack::create(new MockHandler([
            new GuzzleResponse(200, ['Content-Type' => 'application/json'], json_encode([
                'id' => 'chat_affordable_grok',
                'choices' => [[
                    'message' => ['role' => 'assistant', 'content' => 'Hello.'],
                ]],
                'usage' => [
                    'prompt_tokens' => 9000,
                    'completion_tokens' => 20,
                    'cost' => 0.00904,
                ],
            ])),
        ]));
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_chat_client', new GuzzleClient(['handler' => $stack]));
        $token = $this->codexUserToken('affordable-grok-terminal@example.com');
        User::where('email', 'affordable-grok-terminal@example.com')->update([
            'plan' => 'free',
            'credits_balance' => 2,
            'weekly_credits_used' => 48,
            'weekly_credits_reset_at' => now()->addDays(6),
        ]);

        $response = $this->post('/api/codex/responses', [
            'model' => 'x-ai/grok-build-0.1',
            'input' => str_repeat('a', 35_000),
            'max_output_tokens' => 2000,
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $this->assertCount(1, $history);
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertGreaterThanOrEqual(800, $payload['max_tokens'] ?? 0);
        $this->assertLessThan(2000, $payload['max_tokens'] ?? 2000);
    }

    public function test_codex_responses_rejects_context_over_the_plan_cap_before_reservation(): void
    {
        config([
            'services.openrouter.key' => 'test-openrouter-key',
            'billing.plans.starter.context_token_cap' => 800,
        ]);
        $token = $this->codexUserToken('codex-context-limit@example.com');

        $this->postJson('/api/codex/responses', [
            'model' => 'gpt-5.5',
            'input' => 'Inspect this repository.',
            'max_output_tokens' => 800,
            'stream' => true,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(413)
            ->assertJsonPath('error.code', 'membership_context_limit')
            ->assertJsonPath('error.details.contextTokenCap', 800);

        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }
}
