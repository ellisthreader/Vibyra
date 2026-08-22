<?php

namespace Tests\Feature\Concerns\NextTen;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;

trait TestsChatStreamRouting
{
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
            $this->assertStringContainsString('"modelKey":"openai/gpt-5.6-terra"', $content);
            $this->assertStringContainsString('"category":"agentic_coding"', $content);
            $this->assertCount(1, $history);
            $payload = json_decode((string) $history[0]['request']->getBody(), true);
            $this->assertSame('openai/gpt-5.6-terra', $payload['model'] ?? null);
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
}
