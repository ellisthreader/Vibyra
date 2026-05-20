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

class VibyraChatToolsApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_chat_tool_skills_use_specialist_or_selected_openrouter_models(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $payloads = [];
        Http::fake(function ($request) use (&$payloads) {
            $payloads[] = $request->data();

            return Http::response([
                'choices' => [[
                    'message' => ['content' => 'Specialized answer.'],
                ]],
            ]);
        });

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-specialized-tools@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'alex-specialized-tools@example.com')->update([
            'plan' => 'starter',
            'credits_balance' => 500,
        ]);

        foreach ([
            ['skill' => 'research', 'model' => 'tool-deep-research', 'reasoningEffort' => 'low'],
            ['skill' => 'web', 'model' => 'tool-web-search'],
            ['skill' => 'analyze', 'model' => 'tool-analyze-files'],
        ] as $case) {
            $this->postJson('/api/chat', [
                'prompt' => "Run {$case['skill']}.",
                'skill' => $case['skill'],
                'model' => $case['model'],
                'projectFiles' => [['path' => 'src/App.tsx', 'snippet' => 'export function App() {}']],
                'reasoningEffort' => $case['reasoningEffort'] ?? 'medium',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('reply', 'Specialized answer.');
        }

        $this->assertSame('google/gemini-2.5-flash-lite', $payloads[0]['model'] ?? null);
        $this->assertSame('openrouter:web_search', $payloads[0]['tools'][0]['type'] ?? null);
        $this->assertSame('auto', $payloads[0]['tools'][0]['parameters']['engine'] ?? null);
        $this->assertSame(16000, $payloads[0]['max_completion_tokens'] ?? null);
        $this->assertTrue($payloads[0]['reasoning']['exclude'] ?? false);
        $this->assertSame(0.25, $payloads[0]['temperature'] ?? null);

        $this->assertSame('google/gemini-2.5-flash-lite', $payloads[1]['model'] ?? null);
        $this->assertSame('openrouter:web_search', $payloads[1]['tools'][0]['type'] ?? null);
        $this->assertSame(1200, $payloads[1]['max_completion_tokens'] ?? null);
        $this->assertTrue($payloads[1]['reasoning']['exclude'] ?? false);
        $this->assertSame(0.25, $payloads[1]['temperature'] ?? null);

        $this->assertSame('google/gemini-2.5-flash-lite', $payloads[2]['model'] ?? null);
        $this->assertArrayNotHasKey('tools', $payloads[2]);
        $this->assertSame(1800, $payloads[2]['max_completion_tokens'] ?? null);
        $this->assertTrue($payloads[2]['reasoning']['exclude'] ?? false);
        $this->assertSame(0.25, $payloads[2]['temperature'] ?? null);
    }

    public function test_budget_tool_models_are_available_on_free_plan(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $payloads = [];
        Http::fake(function ($request) use (&$payloads) {
            $payloads[] = $request->data();
            return Http::response([
                'choices' => [[
                    'message' => ['content' => 'Budget research answer.'],
                ]],
                'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 8, 'cost' => 0.001],
            ]);
        });

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-free-specialized-tools@example.com',
            'password' => 'secret123',
        ])->json('token');

        foreach (['research', 'web', 'analyze'] as $skill) {
            $this->postJson('/api/chat', [
                'prompt' => "Run {$skill}.",
                'skill' => $skill,
                'model' => 'gpt-5.4-mini',
            ], ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('reply', 'Budget research answer.');
        }

        $this->assertSame([
            'google/gemini-2.5-flash-lite',
            'google/gemini-2.5-flash-lite',
            'google/gemini-2.5-flash-lite',
        ], array_map(fn ($payload) => $payload['model'] ?? null, $payloads));
    }

    public function test_chat_rejects_tool_only_model_without_matching_tool(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-tool-only-model@example.com',
            'password' => 'secret123',
        ])->json('token');

        foreach (['tool-deep-research', 'tool-web-search', 'tool-analyze-files'] as $model) {
            $this->postJson('/api/chat', [
                'prompt' => "Use {$model} directly.",
                'model' => $model,
            ], ['Authorization' => "Bearer {$token}"])
                ->assertStatus(422)
                ->assertJsonPath('error', 'This model is only available through its chat tool.');
        }
    }

    public function test_chat_retries_empty_deep_research_completion_before_charging(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $payloads = [];
        Http::fake(function ($request) use (&$payloads) {
            $payloads[] = $request->data();

            if (count($payloads) === 1) {
                return Http::response([
                    'choices' => [[
                        'finish_reason' => 'length',
                        'message' => ['content' => ''],
                    ]],
                    'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 16000, 'cost' => 0.0],
                ]);
            }

            return Http::response([
                'choices' => [[
                    'message' => ['content' => 'For most UK homes, British Shorthair and Ragdoll are strong kitten breed choices.'],
                ]],
                'usage' => ['prompt_tokens' => 24, 'completion_tokens' => 22, 'cost' => 0.0],
            ]);
        });

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-retry-deep-research@example.com',
            'password' => 'secret123',
        ])->json('token');
        User::where('email', 'alex-retry-deep-research@example.com')->update([
            'plan' => 'starter',
            'credits_balance' => 500,
        ]);

        $this->postJson('/api/chat', [
            'prompt' => 'best kitten breed in uk',
            'skill' => 'research',
            'model' => 'tool-deep-research',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'For most UK homes, British Shorthair and Ragdoll are strong kitten breed choices.');

        $this->assertCount(2, $payloads);
        $this->assertSame(16000, $payloads[0]['max_completion_tokens'] ?? null);
        $this->assertSame(16000, $payloads[1]['max_completion_tokens'] ?? null);
        $this->assertStringContainsString('previous Deep Research attempt returned no final answer', $payloads[1]['messages'][array_key_last($payloads[1]['messages'])]['content'] ?? '');
        $this->assertSame(1, DB::table('credit_ledger')->where('kind', 'chat')->count());
    }
}
