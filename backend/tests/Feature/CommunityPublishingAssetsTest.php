<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CommunityPublishingAssetsTest extends TestCase
{
    use RefreshDatabase;

    protected function fakeCleanModeration(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => false,
                    'categories' => [],
                    'category_scores' => [],
                ]],
            ]),
        ]);
    }
    public function test_user_can_generate_publish_assets_for_credits(): void
    {
        config([
            'billing.plans.free.daily_credit_cap' => 100,
            'services.openai.key' => 'test-openai-key',
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openrouter.image_model' => 'openai/gpt-5.4-image-2',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => false,
                    'categories' => [],
                    'category_scores' => [],
                ]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'images' => [[
                            'image_url' => ['url' => 'data:image/png;base64,'.base64_encode('generated-logo')],
                        ]],
                    ],
                ]],
            ]),
        ]);

        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.assets@example.com',
            'password' => 'secret123',
        ])->assertCreated();
        $token = $signup->json('token');
        $startCredits = (int) $signup->json('user.creditsBalance');

        $this->postJson('/api/community/assets/generate', [
            'kind' => 'logo',
            'title' => 'Client Portal',
            'description' => 'A dashboard for client onboarding.',
            'prompt' => 'clean purple mark',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('kind', 'logo')
            ->assertJsonPath('creditCost', 12)
            ->assertJsonPath('creditsBalance', $startCredits - 12)
            ->assertJsonPath('provider', 'openrouter')
            ->assertJson(fn ($json) => $json->where('ok', true)->whereType('imageUrl', 'string')->etc());

        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
            && $request['model'] === 'openai/gpt-5.4-image-2'
            && $request['modalities'] === ['image']
            && $request['image_config']['aspect_ratio'] === '1:1');
    }

    public function test_user_can_generate_publish_screenshots_for_credits(): void
    {
        config([
            'billing.plans.free.daily_credit_cap' => 100,
            'services.openai.key' => 'test-openai-key',
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openrouter.image_model' => 'openai/gpt-5.4-image-2',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => false,
                    'categories' => [],
                    'category_scores' => [],
                ]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'images' => [[
                            'imageUrl' => ['url' => 'data:image/png;base64,'.base64_encode('generated-screenshot')],
                        ]],
                    ],
                ]],
            ]),
        ]);

        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.screenshots@example.com',
            'password' => 'secret123',
        ])->assertCreated();
        $token = $signup->json('token');
        $startCredits = (int) $signup->json('user.creditsBalance');

        $this->postJson('/api/community/assets/generate', [
            'kind' => 'screenshot',
            'title' => 'Client Portal',
            'description' => 'A dashboard for client onboarding.',
            'prompt' => 'polished app screen',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('kind', 'screenshot')
            ->assertJsonPath('creditCost', 20)
            ->assertJsonPath('creditsBalance', $startCredits - 20)
            ->assertJsonPath('provider', 'openrouter')
            ->assertJson(fn ($json) => $json->where('ok', true)->whereType('imageUrl', 'string')->etc());

        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
            && $request['model'] === 'openai/gpt-5.4-image-2'
            && $request['modalities'] === ['image']
            && $request['image_config']['aspect_ratio'] === '16:9');
    }

    public function test_publish_asset_generation_accepts_gpt_image_base64_response(): void
    {
        config([
            'billing.plans.free.daily_credit_cap' => 100,
            'services.openai.key' => 'test-openai-key',
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openrouter.image_model' => 'openai/gpt-5.4-image-2',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => false,
                    'categories' => [],
                    'category_scores' => [],
                ]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => [[
                            'type' => 'image',
                            'b64_json' => base64_encode('generated-image'),
                        ]],
                    ],
                ]],
            ]),
        ]);

        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.b64-image@example.com',
            'password' => 'secret123',
        ])->assertCreated();
        $token = $signup->json('token');

        $this->postJson('/api/community/assets/generate', [
            'kind' => 'screenshot',
            'title' => 'Client Portal',
            'description' => 'A dashboard for client onboarding.',
            'prompt' => 'polished app screen',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('imageUrl', 'data:image/png;base64,'.base64_encode('generated-image'));
    }

    public function test_publish_asset_generation_requires_openrouter_configuration_without_charging(): void
    {
        config(['billing.plans.free.daily_credit_cap' => 100, 'services.openai.key' => 'test-openai-key', 'services.openrouter.key' => null]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => false,
                    'categories' => [],
                    'category_scores' => [],
                ]],
            ]),
        ]);

        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.no-image-key@example.com',
            'password' => 'secret123',
        ])->assertCreated();
        $token = $signup->json('token');
        $startCredits = (int) $signup->json('user.creditsBalance');

        $this->postJson('/api/community/assets/generate', [
            'kind' => 'logo',
            'title' => 'Client Portal',
            'description' => 'A dashboard for client onboarding.',
            'prompt' => 'clean purple mark',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(502)
            ->assertJsonPath('ok', false)
            ->assertJsonPath('error', 'OpenRouter image generation is not configured. Set OPENROUTER_API_KEY to generate publish images.');

        $this->assertDatabaseHas('users', [
            'email' => 'alex.no-image-key@example.com',
            'credits_balance' => $startCredits,
        ]);
    }
}
