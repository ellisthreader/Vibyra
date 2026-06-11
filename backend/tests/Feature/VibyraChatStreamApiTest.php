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

class VibyraChatStreamApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_chat_stream_rejects_missing_auth(): void
    {
        $this->postJson('/api/chat/stream', ['prompt' => 'Hi'])
            ->assertUnauthorized();
    }

    public function test_chat_stream_rejects_empty_prompt(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Stream User',
            'email' => 'stream@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat/stream', ['prompt' => ''], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Ask Vibyra something first.');
    }

    public function test_chat_stream_rejects_context_over_the_plan_cap_before_dispatch(): void
    {
        config([
            'services.openrouter.key' => 'test-openrouter-key',
            'billing.plans.free.context_token_cap' => 100,
        ]);
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Stream Context User',
            'email' => 'stream-context@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat/stream', [
            'prompt' => str_repeat('context ', 100),
            'model' => 'gpt-5.4-mini',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(413)
            ->assertJsonPath('code', 'membership_context_limit');

        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    public function test_chat_stream_rejects_unsupported_plan_model(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Stream User',
            'email' => 'streamer@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat/stream', [
            'prompt' => 'Hello',
            'model' => 'claude-opus-4',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(403)
            ->assertJsonPath('plan', 'free');
    }

    public function test_chat_stream_rejects_tool_only_model_without_matching_tool(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Stream User',
            'email' => 'stream-tool-only-model@example.com',
            'password' => 'secret123',
        ])->json('token');

        foreach (['tool-deep-research', 'tool-web-search', 'tool-analyze-files'] as $model) {
            $this->postJson('/api/chat/stream', [
                'prompt' => "Use {$model} directly.",
                'model' => $model,
            ], ['Authorization' => "Bearer {$token}"])
                ->assertStatus(422)
                ->assertJsonPath('error', 'This model is only available through its chat tool.');
        }
    }

    public function test_chat_stream_auto_routes_and_emits_the_selected_model(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $streamBody = "data: ".json_encode([
            'choices' => [['delta' => ['content' => 'Implemented.']]],
            'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 8, 'cost' => 0.001],
        ])."\n\ndata: [DONE]\n\n";
        $mock = new MockHandler([new GuzzleResponse(200, ['Content-Type' => 'text/event-stream'], $streamBody)]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_stream_client', new GuzzleClient(['handler' => $stack]));

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Auto Stream User',
            'email' => 'auto-stream@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'auto-stream@example.com')->update([
            'plan' => 'starter',
            'credits_balance' => 500,
        ]);

        $response = $this->post('/api/chat/stream', [
            'prompt' => 'Implement the API and its tests.',
            'model' => 'auto',
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $content = $response->streamedContent();
        $this->assertStringContainsString('"modelKey":"openai/gpt-5.5"', $content);
        $this->assertStringContainsString('"category":"agentic_coding"', $content);
        $this->assertCount(1, $history);
        $payload = json_decode((string) $history[0]['request']->getBody(), true);
        $this->assertSame('openai/gpt-5.5', $payload['model'] ?? null);
    }

    public function test_chat_stream_allows_budget_research_tool_on_free_plan(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $mock = new MockHandler([new GuzzleResponse(200, ["Content-Type" => "application/json"], json_encode([
            "choices" => [["message" => ["content" => "Budget research answer."]]],
            "usage" => ["prompt_tokens" => 20, "completion_tokens" => 8, "cost" => 0.001],
        ]))]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        app()->instance("vibyra.openrouter_stream_client", new GuzzleClient(["handler" => $stack]));

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Stream User',
            'email' => 'stream-tool@example.com',
            'password' => 'secret123',
        ])->json('token');

        $response = $this->post("/api/chat/stream", [
            "prompt" => "Research current pricing.",
            "skill" => "research",
            "model" => "gpt-5.4-mini",
        ], ["Authorization" => "Bearer {$token}"]);
        $response->assertOk();
        $response->streamedContent();

        $this->assertCount(1, $history);
        $payload = json_decode((string) $history[0]["request"]->getBody(), true);
        $this->assertSame("google/gemini-2.5-flash-lite", $payload["model"] ?? null);
    }

    public function test_chat_stream_uses_budget_tool_models_for_web_and_analyze(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $history = [];
        $streamBody = fn (string $text) => "data: " . json_encode([
            "choices" => [["delta" => ["content" => $text]]],
            "usage" => ["prompt_tokens" => 20, "completion_tokens" => 8, "cost" => 0.001],
        ]) . "\n\ndata: [DONE]\n\n";
        $mock = new MockHandler([
            new GuzzleResponse(200, ["Content-Type" => "text/event-stream"], $streamBody("Web answer.")),
            new GuzzleResponse(200, ["Content-Type" => "text/event-stream"], $streamBody("Analyze answer.")),
        ]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        app()->instance("vibyra.openrouter_stream_client", new GuzzleClient(["handler" => $stack]));

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Stream User',
            'email' => 'stream-budget-tools@example.com',
            'password' => 'secret123',
        ])->json('token');

        foreach ([
            ['skill' => 'web', 'model' => 'tool-web-search'],
            ['skill' => 'analyze', 'model' => 'tool-analyze-files'],
        ] as $case) {
            $response = $this->post("/api/chat/stream", [
                "prompt" => "Run {$case['skill']}.",
                "skill" => $case['skill'],
                "model" => $case['model'],
                "projectFiles" => [["path" => "src/App.tsx", "snippet" => "export function App() {}"]],
            ], ["Authorization" => "Bearer {$token}"]);
            $response->assertOk();
            $this->assertStringContainsString("event: final", $response->streamedContent());
        }

        $this->assertCount(2, $history);
        $webPayload = json_decode((string) $history[0]["request"]->getBody(), true);
        $analyzePayload = json_decode((string) $history[1]["request"]->getBody(), true);

        $this->assertSame("google/gemini-2.5-flash-lite", $webPayload["model"] ?? null);
        $this->assertSame("openrouter:web_search", $webPayload["tools"][0]["type"] ?? null);
        $this->assertSame(1200, $webPayload["max_completion_tokens"] ?? null);
        $this->assertTrue($webPayload["reasoning"]["exclude"] ?? false);
        $this->assertTrue($webPayload["stream"] ?? false);

        $this->assertSame("google/gemini-2.5-flash-lite", $analyzePayload["model"] ?? null);
        $this->assertArrayNotHasKey("tools", $analyzePayload);
        $this->assertSame(1800, $analyzePayload["max_completion_tokens"] ?? null);
        $this->assertTrue($analyzePayload["reasoning"]["exclude"] ?? false);
        $this->assertTrue($analyzePayload["stream"] ?? false);
    }

    public function test_chat_stream_uses_non_streaming_provider_request_for_deep_research_without_real_provider(): void
    {
        config(["services.openrouter.key" => "test-openrouter-key"]);
        $history = [];
        $providerResponse = [
            "choices" => [[
                "message" => ["content" => "For most homes, the best kitten breed is a Ragdoll or British Shorthair."],
            ]],
            "usage" => ["prompt_tokens" => 12, "completion_tokens" => 18, "cost" => 0.0],
        ];

        $mock = new MockHandler([new GuzzleResponse(200, ["Content-Type" => "application/json"], json_encode($providerResponse))]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        app()->instance("vibyra.openrouter_stream_client", new GuzzleClient(["handler" => $stack]));

        $token = $this->postJson("/api/auth/signup", [
            "name" => "Stream User",
            "email" => "stream-deep-research-success@example.com",
            "password" => "secret123",
        ])->json("token");
        User::where("email", "stream-deep-research-success@example.com")->update([
            "plan" => "starter",
            "credits_balance" => 500,
        ]);

        $response = $this->post("/api/chat/stream", [
            "prompt" => "best kitten breed",
            "skill" => "research",
            "model" => "tool-deep-research",
            "reasoningEffort" => "low",
        ], ["Authorization" => "Bearer {$token}"]);

        $response->assertOk();
        $content = $response->streamedContent();

        $this->assertStringContainsString("event: chunk", $content);
        $this->assertStringContainsString("event: final", $content);
        $this->assertStringContainsString("Ragdoll", $content);
        $this->assertStringNotContainsString("I received an empty response from the selected model", $content);
        $this->assertStringNotContainsString("without answer content", $content);
        $this->assertCount(1, $history);

        $request = $history[0]["request"];
        $payload = json_decode((string) $request->getBody(), true);
        $this->assertSame("application/json", $request->getHeaderLine("Accept"));
        $this->assertSame("google/gemini-2.5-flash-lite", $payload["model"] ?? null);
        $this->assertSame(16000, $payload["max_completion_tokens"] ?? null);
        $this->assertTrue($payload["reasoning"]["exclude"] ?? false);
        $this->assertArrayNotHasKey("stream", $payload);
        $this->assertSame(0.25, $payload["temperature"] ?? null);
        $this->assertSame("openrouter:web_search", $payload["tools"][0]["type"] ?? null);
    }

    public function test_chat_stream_retries_empty_deep_research_completion_before_erroring(): void
    {
        config([
            "services.openrouter.key" => "test-openrouter-key",
            "billing.plans.starter.context_token_cap" => 6000,
        ]);
        $history = [];
        $emptyProviderResponse = [
            "choices" => [[
                "finish_reason" => "length",
                "message" => ["content" => ""],
            ]],
            "usage" => ["prompt_tokens" => 20, "completion_tokens" => 16000, "cost" => 0.0],
        ];
        $providerResponse = [
            "choices" => [[
                "message" => ["content" => "For UK families, consider British Shorthair, Ragdoll, or Burmese kittens after checking temperament and breeder standards."],
            ]],
            "usage" => ["prompt_tokens" => 24, "completion_tokens" => 25, "cost" => 0.0],
        ];

        $mock = new MockHandler([
            new GuzzleResponse(200, ["Content-Type" => "application/json"], json_encode($emptyProviderResponse)),
            new GuzzleResponse(200, ["Content-Type" => "application/json"], json_encode($providerResponse)),
        ]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        app()->instance("vibyra.openrouter_stream_client", new GuzzleClient(["handler" => $stack]));

        $token = $this->postJson("/api/auth/signup", [
            "name" => "Stream User",
            "email" => "stream-deep-research-retry@example.com",
            "password" => "secret123",
        ])->json("token");
        User::where("email", "stream-deep-research-retry@example.com")->update([
            "plan" => "starter",
            "credits_balance" => 500,
        ]);

        $response = $this->post("/api/chat/stream", [
            "prompt" => "best kitten breed in uk",
            "skill" => "research",
            "model" => "tool-deep-research",
        ], ["Authorization" => "Bearer {$token}"]);

        $response->assertOk();
        $content = $response->streamedContent();

        $this->assertStringContainsString("event: chunk", $content);
        $this->assertStringContainsString("event: final", $content);
        $this->assertStringContainsString("British Shorthair", $content);
        $this->assertStringNotContainsString("without answer content", $content);
        $this->assertCount(2, $history);

        $firstPayload = json_decode((string) $history[0]["request"]->getBody(), true);
        $retryPayload = json_decode((string) $history[1]["request"]->getBody(), true);
        $this->assertLessThan(8000, $firstPayload["max_completion_tokens"] ?? 8000);
        $this->assertLessThan(
            $firstPayload["max_completion_tokens"] ?? 0,
            $retryPayload["max_completion_tokens"] ?? PHP_INT_MAX
        );
        $this->assertStringContainsString("previous Deep Research attempt returned no final answer", $retryPayload["messages"][array_key_last($retryPayload["messages"])]["content"] ?? "");
        $this->assertSame(1, DB::table("credit_ledger")->where("kind", "chat")->count());
    }
}
