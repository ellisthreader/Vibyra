<?php

namespace Tests\Feature\Support\CodexResponses;

use App\Models\CreditLedger;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response as GuzzleResponse;

trait CodexResponsesStreamOutcomeCases
{
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
}
