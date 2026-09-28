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

trait TestsChatStreamResearch
{
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
