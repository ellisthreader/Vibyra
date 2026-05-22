<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CommunityPublishingHostedDemoTest extends TestCase
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

    public function test_publish_creates_static_hosted_demo_payload_and_route(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Hosted Demo',
            'email' => 'hosted.demo@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'hosted-demo',
            'title' => 'Hosted Demo',
            'description' => 'A clean static demo.',
            'stack' => 'HTML',
            'previewHtml' => '<!doctype html><html><body><h1>Hosted</h1><button>Open</button></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Hosted</h1>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('project.hostingMode', PublishedProjectDeployment::MODE_STATIC)
            ->assertJsonPath('project.deploymentStatus', PublishedProjectDeployment::STATUS_STATIC_LIVE);

        $slug = $publish->json('project.id');
        $demoUrl = "/api/community/projects/{$slug}/demo";

        $this->assertSame($demoUrl, $publish->json('project.publicUrl'));
        $this->assertSame($demoUrl, $publish->json('project.appUrl'));
        $this->assertDatabaseHas('published_project_deployments', [
            'published_project_id' => PublishedProject::where('slug', $slug)->value('id'),
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'public_url' => $demoUrl,
        ]);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.publicUrl', $demoUrl)
            ->assertJsonPath('projects.0.appUrl', $demoUrl)
            ->assertJsonPath('projects.0.deploymentStatus', PublishedProjectDeployment::STATUS_STATIC_LIVE);

        $response = $this->get($demoUrl)
            ->assertOk()
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertSee('Hosted');

        $this->assertStringContainsString("connect-src 'none'", (string) $response->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString("frame-ancestors 'none'", (string) $response->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString('local-network-access=()', (string) $response->headers->get('Permissions-Policy'));

        $this->get("/api/community/projects/{$slug}/preview")
            ->assertOk()
            ->assertSee('Hosted');
    }

    public function test_publish_can_store_and_serve_hosted_static_demo_bundle_files(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Hosted Bundle',
            'email' => 'hosted.bundle@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'hosted-bundle',
            'title' => 'Hosted Bundle',
            'description' => 'A clean static demo bundle.',
            'stack' => 'Vite',
            'previewHtml' => '<!doctype html><html><body><h1>Bundle fallback</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Bundle</h1>'],
            ],
            'hostedDemo' => [
                'ok' => true,
                'entryPath' => 'index.html',
                'files' => [
                    [
                        'path' => 'index.html',
                        'contentType' => 'text/html; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '<!doctype html><html><body><h1>Bundle app</h1><script src="/assets/app.js"></script></body></html>',
                    ],
                    [
                        'path' => 'assets/app.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => 'window.__bundleLoaded = true;',
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('project.hostingMode', PublishedProjectDeployment::MODE_STATIC)
            ->assertJsonPath('project.deploymentStatus', PublishedProjectDeployment::STATUS_STATIC_LIVE);

        $slug = $publish->json('project.id');
        $demoUrl = "/api/community/projects/{$slug}/demo";

        $this->get($demoUrl)
            ->assertOk()
            ->assertSee('Bundle app')
            ->assertSee("{$demoUrl}/assets/app.js", false);

        $this->get("{$demoUrl}/assets/app.js")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/javascript; charset=UTF-8')
            ->assertSee('window.__bundleLoaded = true;', false);

        $projectId = PublishedProject::where('slug', $slug)->value('id');
        $deployment = PublishedProjectDeployment::where('published_project_id', $projectId)->firstOrFail();
        $this->assertNull($deployment->demo_html);
        $this->assertSame('index.html', $deployment->entry_path);
        $this->assertCount(2, $deployment->demo_files);
    }

    public function test_latest_successful_demo_is_preserved_when_latest_attempt_fails(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Failed Redeploy',
            'email' => 'failed.redeploy@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'failed-redeploy',
            'title' => 'Failed Redeploy',
            'description' => 'A clean static demo before a Railway failure.',
            'stack' => 'React',
            'previewHtml' => '<!doctype html><html><body><h1>Last good demo</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Last good demo</h1>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();

        $slug = $publish->json('project.id');
        $project = PublishedProject::where('slug', $slug)->firstOrFail();

        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_FAILED,
            'provider_status' => 'build_failed',
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'demo_mode_enabled' => true,
            'stack' => 'React',
            'last_error' => 'Railway upload is not implemented in tests.',
        ]);

        $demoUrl = "/api/community/projects/{$slug}/demo";

        $this->getJson('/api/projects/publish-status', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('projects.0.deploymentStatus', PublishedProjectDeployment::STATUS_FAILED)
            ->assertJsonPath('projects.0.hostingMode', PublishedProjectDeployment::MODE_STATIC)
            ->assertJsonPath('projects.0.publicUrl', $demoUrl)
            ->assertJsonPath('projects.0.appUrl', $demoUrl);

        $this->get($demoUrl)
            ->assertOk()
            ->assertSee('Last good demo');
    }

    public function test_preview_route_remains_fallback_when_no_hosted_demo_exists(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Preview Fallback',
            'email' => 'preview.fallback@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'preview-fallback',
            'title' => 'Preview Fallback',
            'description' => 'A clean project with only inert preview HTML.',
            'previewHtml' => '<!doctype html><html><body><h1>Preview only</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Preview only</h1>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();

        $project = PublishedProject::where('source_project_id', 'preview-fallback')->firstOrFail();
        PublishedProjectDeployment::where('published_project_id', $project->id)->delete();

        $previewUrl = "/api/community/projects/{$project->slug}/preview";

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.publicUrl', null)
            ->assertJsonPath('projects.0.appUrl', $previewUrl)
            ->assertJsonPath('projects.0.hostingMode', 'preview')
            ->assertJsonPath('projects.0.deploymentStatus', 'preview_only');

        $this->get($previewUrl)
            ->assertOk()
            ->assertSee('Preview only');

        $this->get("/api/community/projects/{$project->slug}/demo")
            ->assertNotFound();
    }

    public function test_railway_success_without_provider_url_does_not_fake_public_url(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Railway Stub',
            'email' => 'railway.stub@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'railway-stub',
            'title' => 'Railway Stub',
            'description' => 'A clean project with a stubbed Railway deployment.',
            'previewHtml' => '<!doctype html><html><body><h1>Railway fallback</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Railway fallback</h1>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();

        $project = PublishedProject::where('source_project_id', 'railway-stub')->firstOrFail();
        PublishedProjectDeployment::where('published_project_id', $project->id)->delete();
        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_LIVE,
            'provider_status' => 'live_without_resolved_url',
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'demo_mode_enabled' => true,
            'hosted_at' => now(),
        ]);

        $previewUrl = "/api/community/projects/{$project->slug}/preview";

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.hostingMode', PublishedProjectDeployment::MODE_RAILWAY)
            ->assertJsonPath('projects.0.deploymentStatus', PublishedProjectDeployment::STATUS_LIVE)
            ->assertJsonPath('projects.0.publicUrl', null)
            ->assertJsonPath('projects.0.appUrl', $previewUrl);

        $this->get("/api/community/projects/{$project->slug}/demo")
            ->assertNotFound();
    }
}
