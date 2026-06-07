<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
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

    public function test_approved_public_project_without_preview_or_deployment_is_not_listed_as_openable(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Empty App Url',
            'email' => 'empty.app.url@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $user = User::where('email', 'empty.app.url@example.com')->firstOrFail();
        PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'empty-app-url',
            'slug' => 'empty-app-url',
            'title' => 'Empty App Url',
            'description' => 'Approved stale row with no preview payload.',
            'stack' => 'React',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->getJson('/api/community/projects', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->getJson('/api/projects/publish-status', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('projects.0.sourceProjectId', 'empty-app-url')
            ->assertJsonPath('projects.0.viewerCanManage', true)
            ->assertJsonPath('projects.0.publicUrl', null)
            ->assertJsonPath('projects.0.previewUrl', null)
            ->assertJsonPath('projects.0.appUrl', null)
            ->assertJsonPath('projects.0.hostedDemoStatus', 'unavailable');

        $this->get('/api/community/projects/empty-app-url/preview')->assertNotFound();
        $this->get('/api/community/projects/empty-app-url/demo')->assertNotFound();
    }

    public function test_generated_source_preview_shell_does_not_count_as_openable_demo(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Source Shell Owner',
            'email' => 'source.shell.owner@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $user = User::where('email', 'source.shell.owner@example.com')->firstOrFail();
        $sourcePreview = '<!doctype html><html><body><h2>Project preview</h2><section><h3>azure/environments/batch.yml</h3><pre><code>name: service-priority-batch</code></pre></section></body></html>';
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'source-shell-project',
            'slug' => 'source-shell-project',
            'title' => 'Source Shell Project',
            'description' => 'Approved stale row that only has a source-code preview shell.',
            'stack' => 'React',
            'preview_html' => $sourcePreview,
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);
        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'provider_status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'hosting_mode' => PublishedProjectDeployment::MODE_STATIC,
            'public_url' => '/api/community/projects/source-shell-project/demo',
            'demo_html' => $sourcePreview,
            'hosted_at' => now(),
        ]);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->getJson('/api/projects/publish-status', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('projects.0.sourceProjectId', 'source-shell-project')
            ->assertJsonPath('projects.0.publicUrl', null)
            ->assertJsonPath('projects.0.previewUrl', null)
            ->assertJsonPath('projects.0.appUrl', null)
            ->assertJsonPath('projects.0.hostedDemoStatus', 'unavailable');

        $this->get('/api/community/projects/source-shell-project/preview')->assertNotFound();
        $this->get('/api/community/projects/source-shell-project/demo')->assertNotFound();
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
            ->assertJsonPath('projects.0.deploymentStatus', 'preview_only')
            ->assertJsonPath('projects.0.hostedDemoStatus', 'unavailable')
            ->assertJsonPath('projects.0.publicUrl', null)
            ->assertJsonPath('projects.0.appUrl', $previewUrl);

        $this->get("/api/community/projects/{$project->slug}/demo")
            ->assertNotFound();
    }

    public function test_private_deployment_urls_are_not_listed_or_returned_to_publish_status(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Private Runtime',
            'email' => 'private.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $user = User::where('email', 'private.runtime@example.com')->firstOrFail();
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'private-runtime',
            'slug' => 'private-runtime',
            'title' => 'Private Runtime',
            'description' => 'A project whose deployment points at a LAN address.',
            'stack' => 'React',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_LIVE,
            'provider_status' => 'live',
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'demo_mode_enabled' => true,
            'public_url' => 'http://192.168.1.109:5173',
            'hosted_at' => now(),
        ]);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->getJson('/api/projects/publish-status', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('projects.0.publicUrl', null)
            ->assertJsonPath('projects.0.appUrl', null)
            ->assertJsonPath('projects.0.hostedDemoStatus', 'unavailable');

        $this->get('/api/community/projects/private-runtime/demo')->assertNotFound();
        $this->get('/api/community/projects/private-runtime/preview')->assertNotFound();
    }

    public function test_private_deployment_url_falls_back_to_safe_preview_url(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Preview Over Private',
            'email' => 'preview.private@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'preview-over-private',
            'title' => 'Preview Over Private',
            'description' => 'A clean project with a safe captured preview.',
            'previewHtml' => '<!doctype html><html><body><h1>Safe captured preview</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Safe captured preview</h1>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();

        $project = PublishedProject::where('source_project_id', 'preview-over-private')->firstOrFail();
        PublishedProjectDeployment::where('published_project_id', $project->id)->delete();
        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_LIVE,
            'provider_status' => 'live',
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'demo_mode_enabled' => true,
            'public_url' => 'http://127.0.0.1:8080',
            'hosted_at' => now(),
        ]);

        $previewUrl = "/api/community/projects/{$project->slug}/preview";

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.publicUrl', null)
            ->assertJsonPath('projects.0.appUrl', $previewUrl)
            ->assertJsonPath('projects.0.deploymentStatus', 'preview_only')
            ->assertJsonPath('projects.0.hostedDemoStatus', 'unavailable');

        $this->get($previewUrl)
            ->assertOk()
            ->assertSee('Safe captured preview');
    }

    public function test_hosted_demo_bundle_with_private_urls_is_rejected_before_listing(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Private Bundle',
            'email' => 'private.bundle@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'private-bundle',
            'title' => 'Private Bundle',
            'description' => 'A bundle that points back to a desktop dev server.',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Private bundle</h1>'],
            ],
            'hostedDemo' => [
                'ok' => true,
                'entryPath' => 'index.html',
                'files' => [
                    [
                        'path' => 'index.html',
                        'contentType' => 'text/html; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '<!doctype html><html><body><a href="http://localhost:5173">Desktop preview</a></body></html>',
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('hostedDemoStatus', 'unavailable');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }

    public function test_hosted_demo_bundle_allows_compiled_static_asset_url_literals(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Compiled Bundle',
            'email' => 'compiled.bundle@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'compiled-bundle',
            'title' => 'Compiled Bundle',
            'description' => 'A static bundle with harmless compiled URL literals.',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Compiled bundle</h1>'],
            ],
            'hostedDemo' => [
                'ok' => true,
                'entryPath' => 'index.html',
                'files' => [
                    [
                        'path' => 'index.html',
                        'contentType' => 'text/html; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '<!doctype html><html><body><h1>Compiled bundle</h1><script src="/assets/app.js"></script></body></html>',
                    ],
                    [
                        'path' => 'assets/app.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => 'const svg="http://www.w3.org/2000/svg"; const fallback = new URL("/", typeof window < "u" ? window.location.origin : "http://localhost"); const re=/^https?:\/\//i.test(svg);',
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('project.hostingMode', PublishedProjectDeployment::MODE_STATIC);

        $this->get("/api/community/projects/{$publish->json('project.id')}/demo")
            ->assertOk()
            ->assertSee('Compiled bundle');
    }

    public function test_hosted_demo_bundle_neutralizes_compiled_local_api_fallback(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Compiled Local Fallback',
            'email' => 'compiled.local.fallback@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'compiled-local-fallback',
            'title' => 'Compiled Local Fallback',
            'description' => 'A static bundle with a development API fallback in compiled JavaScript.',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Compiled local fallback</h1>'],
            ],
            'hostedDemo' => [
                'ok' => true,
                'entryPath' => 'frontend/dist/index.html',
                'files' => [
                    [
                        'path' => 'frontend/dist/index.html',
                        'contentType' => 'text/html; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '<!doctype html><html><body><h1>Compiled local fallback</h1><script src="/assets/app.js"></script></body></html>',
                    ],
                    [
                        'path' => 'frontend/dist/assets/app.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => 'const API_BASE="http://localhost:8010"; fetch(`${API_BASE}/health`);',
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('project.hostingMode', PublishedProjectDeployment::MODE_STATIC);

        $this->get("/api/community/projects/{$publish->json('project.id')}/demo/frontend/dist/assets/app.js")
            ->assertOk()
            ->assertSee('about:blank', false)
            ->assertDontSee('localhost', false);
    }

    public function test_runtime_bundle_creates_queued_railway_deployment_without_public_url(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Builder',
            'email' => 'runtime.builder@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-builder',
            'title' => 'Runtime Builder',
            'description' => 'A clean Express app that needs backend hosting.',
            'stack' => 'Express',
            'sourceFiles' => [
                ['path' => 'package.json', 'language' => 'json', 'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}'],
                ['path' => 'server.js', 'language' => 'js', 'body' => "import express from 'express';"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'buildCommand' => '',
                'startCommand' => 'npm run start',
                'runtimeReason' => 'package.json has a start script.',
                'files' => [
                    [
                        'path' => 'package.json',
                        'contentType' => 'application/json; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}',
                    ],
                    [
                        'path' => 'server.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "import express from 'express';",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.hostingMode', PublishedProjectDeployment::MODE_RAILWAY)
            ->assertJsonPath('publishStatus.deploymentStatus', PublishedProjectDeployment::STATUS_QUEUED)
            ->assertJsonPath('publishStatus.hostedDemoStatus', 'pending')
            ->assertJsonPath('publishStatus.publicUrl', null);

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();

        $this->assertSame(PublishedProjectDeployment::PROVIDER_RAILWAY, $deployment->provider);
        $this->assertSame(PublishedProjectDeployment::STATUS_QUEUED, $deployment->status);
        $this->assertSame('npm run start', $deployment->start_command);
        $this->assertCount(2, $deployment->demo_files);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }

    public function test_laravel_runtime_bundle_creates_queued_railway_deployment(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Laravel Runtime',
            'email' => 'laravel.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'laravel-runtime',
            'title' => 'Laravel Runtime',
            'description' => 'A clean Laravel app that needs backend hosting.',
            'stack' => 'Laravel',
            'sourceFiles' => [
                ['path' => 'composer.json', 'language' => 'json', 'body' => '{"require":{"laravel/framework":"^12.0"}}'],
                ['path' => 'routes/web.php', 'language' => 'php', 'body' => "<?php\nRoute::get('/', fn () => 'Demo');"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'laravel',
                'buildCommand' => 'composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader',
                'startCommand' => 'mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}',
                'runtimeReason' => 'Laravel app with Vite assets.',
                'files' => [
                    [
                        'path' => 'composer.json',
                        'contentType' => 'application/json; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '{"require":{"laravel/framework":"^12.0"}}',
                    ],
                    [
                        'path' => 'artisan',
                        'contentType' => 'text/plain; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "#!/usr/bin/env php\n<?php",
                    ],
                    [
                        'path' => 'public/build/assets/app.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "console.log('demo');",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.hostingMode', PublishedProjectDeployment::MODE_RAILWAY)
            ->assertJsonPath('publishStatus.deploymentStatus', PublishedProjectDeployment::STATUS_QUEUED);

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();

        $this->assertSame(PublishedProjectDeployment::PROVIDER_RAILWAY, $deployment->provider);
        $this->assertSame('laravel', $deployment->metadata['platform'] ?? null);
        $this->assertSame('mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}', $deployment->start_command);
        $this->assertCount(3, $deployment->demo_files);
    }

    public function test_python_runtime_bundle_creates_queued_railway_deployment(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Python Runtime',
            'email' => 'python.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'python-runtime',
            'title' => 'Python Runtime',
            'description' => 'A clean FastAPI backend.',
            'stack' => 'FastAPI',
            'sourceFiles' => [
                ['path' => 'requirements.txt', 'language' => 'text', 'body' => 'fastapi==0.115.0'],
                ['path' => 'app/main.py', 'language' => 'python', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'buildCommand' => 'pip install -r requirements.txt',
                'startCommand' => 'python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}',
                'runtimeReason' => 'FastAPI backend detected.',
                'files' => [
                    [
                        'path' => 'requirements.txt',
                        'contentType' => 'text/plain; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => 'fastapi==0.115.0',
                    ],
                    [
                        'path' => 'app/main.py',
                        'contentType' => 'text/plain; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "from fastapi import FastAPI\napp = FastAPI()\n",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.backendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendPlatform', 'python')
            ->assertJsonPath('publishStatus.frontendStatus', 'unavailable');

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();

        $this->assertSame('python', $deployment->metadata['platform'] ?? null);
        $this->assertSame('pip install -r requirements.txt', $deployment->build_command);
        $this->assertSame('python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}', $deployment->start_command);
    }

    public function test_runtime_bundle_with_private_urls_is_rejected(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Private',
            'email' => 'runtime.private@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-private',
            'title' => 'Runtime Private',
            'description' => 'A runtime bundle that points back to localhost.',
            'sourceFiles' => [
                ['path' => 'package.json', 'language' => 'json', 'body' => '{"scripts":{"start":"node server.js"}}'],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'startCommand' => 'npm run start',
                'files' => [
                    [
                        'path' => 'package.json',
                        'contentType' => 'application/json; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '{"scripts":{"start":"node server.js"}}',
                    ],
                    [
                        'path' => 'server.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "fetch('http://localhost:3000/api')",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('hostedDemoStatus', 'unavailable');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }
}
