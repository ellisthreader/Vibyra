<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CommunityPublishingTest extends TestCase
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

    public function test_user_can_publish_project_and_community_can_read_it(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.community@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];
        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'project-123',
            'title' => 'Client Portal',
            'description' => 'A dashboard for client onboarding.',
            'stack' => 'React',
            'tags' => ['dashboard', 'clients'],
            'logoImageUrl' => 'data:image/png;base64,'.base64_encode('logo'),
            'screenshotUrls' => ['data:image/png;base64,'.base64_encode('screen')],
            'previewHtml' => '<!doctype html><html><body><h1>Portal</h1></body></html>',
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('isPublic', true);

        $slug = $publish->json('project.id');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug)
            ->assertJsonPath('projects.0.title', 'Client Portal')
            ->assertJsonPath('projects.0.screenshots.0', 'Screenshot 1');

        $this->postJson("/api/community/projects/{$slug}/comments", [
            'text' => 'Looks useful.',
        ], $headers)->assertCreated()->assertJsonPath('comment.text', 'Looks useful.');

        $this->postJson("/api/community/projects/{$slug}/reaction", [], $headers)
            ->assertOk()
            ->assertJsonPath('liked', true)
            ->assertJsonPath('likes', 1);

        $this->get("/api/community/projects/{$slug}/preview")
            ->assertOk()
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertDontSee('<script>', false)
            ->assertSee('Portal');

        Http::assertSent(fn ($request) => collect($request['input'] ?? [])
            ->contains(fn ($item) => ($item['type'] ?? null) === 'image_url'));
    }

    public function test_publish_with_unsafe_preview_is_denied_and_hidden(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Unsafe Publisher',
            'email' => 'unsafe.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'unsafe-preview',
            'title' => 'Unsafe Preview',
            'description' => 'A project with unsafe preview HTML.',
            'previewHtml' => '<!doctype html><html><body><script>alert(1)</script><h1>Bad</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED)
            ->assertJsonPath('safetyFindings.0.code', 'script_tag');

        $project = PublishedProject::where('source_project_id', 'unsafe-preview')->firstOrFail();
        $this->assertSame(PublishedProject::REVIEW_DENIED, $project->review_status);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$project->slug}/preview")->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_publish_goes_under_review_when_remote_moderation_is_unavailable(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Manual Review',
            'email' => 'manual.review@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'manual-review',
            'title' => 'Pending Portal',
            'description' => 'A clean project that needs moderation service review.',
            'previewHtml' => '<!doctype html><html><body><h1>Pending</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('isPublic', false);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")->assertNotFound();
    }

    public function test_publish_goes_under_review_when_preview_html_is_too_large(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Large Preview',
            'email' => 'large.preview@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'large-preview',
            'title' => 'Large Preview',
            'description' => 'A clean project with a very large preview.',
            'previewHtml' => '<!doctype html><html><body><h1>'.str_repeat('A', 181000).'</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('isPublic', false)
            ->assertJsonPath('safetyFindings.0.code', 'preview_html_too_large');

        $project = PublishedProject::where('source_project_id', 'large-preview')->firstOrFail();
        $this->assertSame(PublishedProject::REVIEW_UNDER_REVIEW, $project->review_status);
        $this->assertLessThanOrEqual(180000, strlen((string) $project->preview_html));

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_publish_rejects_private_media_hosts_and_secret_like_content(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Secret Publisher',
            'email' => 'secret.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'secret-project',
            'title' => 'Secret Portal',
            'description' => "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
            'logoImageUrl' => 'https://127.0.0.1/logo.png',
            'previewHtml' => '<!doctype html><html><body><h1>Secret</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED);

        $project = PublishedProject::where('source_project_id', 'secret-project')->firstOrFail();
        $codes = collect($project->review_flags)->pluck('code')->all();
        $this->assertContains('env_file', $codes);
        $this->assertContains('openai_key', $codes);
        $this->assertContains('private_image_host', $codes);
        Http::assertNothingSent();
    }

    public function test_user_can_generate_publish_assets_for_credits(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openrouter.image_model' => 'openai/gpt-5-image',
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
            ->assertJsonPath('creditCost', 2)
            ->assertJsonPath('creditsBalance', $startCredits - 2)
            ->assertJsonPath('provider', 'openrouter')
            ->assertJson(fn ($json) => $json->where('ok', true)->whereType('imageUrl', 'string')->etc());

        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
            && $request['model'] === 'openai/gpt-5-image'
            && $request['modalities'] === ['image']
            && $request['image_config']['aspect_ratio'] === '1:1');
    }

    public function test_user_can_generate_publish_screenshots_for_credits(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openrouter.image_model' => 'openai/gpt-5-image',
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
            ->assertJsonPath('creditCost', 4)
            ->assertJsonPath('creditsBalance', $startCredits - 4)
            ->assertJsonPath('provider', 'openrouter')
            ->assertJson(fn ($json) => $json->where('ok', true)->whereType('imageUrl', 'string')->etc());

        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
            && $request['model'] === 'openai/gpt-5-image'
            && $request['modalities'] === ['image']
            && $request['image_config']['aspect_ratio'] === '16:9');
    }

    public function test_publish_asset_generation_requires_openrouter_configuration_without_charging(): void
    {
        config(['services.openai.key' => 'test-openai-key', 'services.openrouter.key' => null]);
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
