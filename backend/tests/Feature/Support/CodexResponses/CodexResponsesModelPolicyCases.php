<?php

namespace Tests\Feature\Support\CodexResponses;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;

trait CodexResponsesModelPolicyCases
{
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
            'openai/gpt-5.6-terra' => ['reasoning'],
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
}
