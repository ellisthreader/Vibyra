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
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
        ]);
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
            ->assertJsonPath('projects.0.deploymentStatus', PublishedProjectDeployment::STATUS_STATIC_LIVE)
            ->assertJsonPath('projects.0.listingState', 'live')
            ->assertJsonPath('projects.0.isDiscoverable', true)
            ->assertJsonPath('projects.0.isOpenable', true)
            ->assertJsonPath('projects.0.currentReleaseState', 'live')
            ->assertJsonPath('projects.0.candidateReleaseState', 'live')
            ->assertJsonPath('projects.0.currentPublicUrl', $demoUrl)
            ->assertJsonPath('projects.0.candidateError', null)
            ->assertJsonPath('projects.0.allowedActions.4', 'open');

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
            ->assertJsonPath('projects.0.isPublic', false)
            ->assertJsonPath('projects.0.isDiscoverable', false)
            ->assertJsonPath('projects.0.isOpenable', false)
            ->assertJsonPath('projects.0.listingState', 'unavailable')
            ->assertJsonPath('projects.0.currentReleaseState', null)
            ->assertJsonPath('projects.0.candidateReleaseState', null)
            ->assertJsonPath('projects.0.currentPublicUrl', null)
            ->assertJsonPath('projects.0.candidateError', null)
            ->assertJsonPath('projects.0.allowedActions.0', 'update_listing')
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

        $candidate = PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_BUILDING,
            'provider_status' => 'building',
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'demo_mode_enabled' => true,
            'stack' => 'React',
        ]);

        $demoUrl = "/api/community/projects/{$slug}/demo";

        $this->getJson('/api/projects/publish-status', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('projects.0.listingState', 'live_updating')
            ->assertJsonPath('projects.0.isDiscoverable', true)
            ->assertJsonPath('projects.0.isOpenable', true)
            ->assertJsonPath('projects.0.currentReleaseState', 'live')
            ->assertJsonPath('projects.0.candidateReleaseState', 'updating')
            ->assertJsonPath('projects.0.currentPublicUrl', $demoUrl);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug)
            ->assertJsonPath('projects.0.isDiscoverable', true)
            ->assertJsonPath('projects.0.isOpenable', true)
            ->assertJsonPath('projects.0.appUrl', $demoUrl);

        $candidate->forceFill([
            'status' => PublishedProjectDeployment::STATUS_FAILED,
            'provider_status' => 'build_failed',
            'last_error' => 'Railway upload is not implemented in tests.',
        ])->save();

        $this->getJson('/api/projects/publish-status', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('projects.0.deploymentStatus', PublishedProjectDeployment::STATUS_FAILED)
            ->assertJsonPath('projects.0.hostingMode', PublishedProjectDeployment::MODE_STATIC)
            ->assertJsonPath('projects.0.publicUrl', $demoUrl)
            ->assertJsonPath('projects.0.appUrl', $demoUrl)
            ->assertJsonPath('projects.0.isPublic', true)
            ->assertJsonPath('projects.0.isDiscoverable', true)
            ->assertJsonPath('projects.0.isOpenable', true)
            ->assertJsonPath('projects.0.listingState', 'live_update_failed')
            ->assertJsonPath('projects.0.currentReleaseState', 'live')
            ->assertJsonPath('projects.0.candidateReleaseState', 'update_failed')
            ->assertJsonPath('projects.0.currentPublicUrl', $demoUrl)
            ->assertJsonPath('projects.0.candidateError', 'Railway upload is not implemented in tests.')
            ->assertJsonPath('projects.0.allowedActions.4', 'open');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug)
            ->assertJsonPath('projects.0.listingState', 'live_update_failed')
            ->assertJsonPath('projects.0.isDiscoverable', true)
            ->assertJsonPath('projects.0.isOpenable', true)
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
            ->assertJsonPath('code', 'hosted_demo_incomplete_or_unsafe')
            ->assertJsonPath('error', 'The hosted frontend bundle was incomplete or unsafe.')
            ->assertJsonPath('frontendStatus', 'failed')
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
            ->assertJsonPath('publishStatus.isPublic', false)
            ->assertJsonPath('publishStatus.isDiscoverable', false)
            ->assertJsonPath('publishStatus.isOpenable', false)
            ->assertJsonPath('publishStatus.listingState', 'building')
            ->assertJsonPath('publishStatus.currentReleaseState', null)
            ->assertJsonPath('publishStatus.candidateReleaseState', 'building')
            ->assertJsonPath('publishStatus.currentPublicUrl', null)
            ->assertJsonPath('publishStatus.candidateError', null)
            ->assertJsonPath('publishStatus.allowedActions.0', 'update_listing')
            ->assertJsonStructure([
                'publishStatus' => ['deploymentCreatedAt', 'deploymentUpdatedAt'],
            ])
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
            ->assertJsonPath('publishStatus.deploymentStatus', PublishedProjectDeployment::STATUS_QUEUED)
            ->assertJsonPath('publishStatus.frontendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendStatus', 'pending');

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();

        $this->assertSame(PublishedProjectDeployment::PROVIDER_RAILWAY, $deployment->provider);
        $this->assertSame('laravel', $deployment->metadata['platform'] ?? null);
        $this->assertTrue($deployment->metadata['frontendIncluded'] ?? false);
        $this->assertSame('mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}', $deployment->start_command);
        $this->assertCount(3, $deployment->demo_files);
    }

    public function test_failed_runtime_bundle_preserves_exact_packaging_error(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Missing Runtime Project',
            'email' => 'missing.runtime.project@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'missing-runtime-project',
            'title' => 'Missing Runtime Project',
            'description' => 'A project removed before runtime packaging.',
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => false,
                'code' => 'project_not_found',
                'message' => 'Project not found',
                'files' => [],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'Project not found')
            ->assertJsonPath('code', 'project_not_found')
            ->assertJsonPath('frontendStatus', 'unavailable')
            ->assertJsonPath('backendStatus', 'failed');

        $this->assertDatabaseMissing('published_projects', [
            'source_project_id' => 'missing-runtime-project',
        ]);
    }

    public function test_valid_static_bundle_is_used_when_runtime_packaging_is_unavailable(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Static Runtime Fallback',
            'email' => 'static.runtime.fallback@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'static-runtime-fallback',
            'title' => 'Static Runtime Fallback',
            'description' => 'A frontend that does not require a server runtime.',
            'visibility' => 'public',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Static fallback</h1>'],
            ],
            'hostedDemo' => [
                'ok' => true,
                'entryPath' => 'index.html',
                'files' => [
                    [
                        'path' => 'index.html',
                        'encoding' => 'utf8',
                        'body' => '<!doctype html><html><body>Static fallback</body></html>',
                    ],
                ],
            ],
            'runtimeBundle' => [
                'ok' => false,
                'code' => 'runtime_not_required',
                'reason' => 'No supported backend runtime was detected.',
                'files' => [],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.hostingMode', PublishedProjectDeployment::MODE_STATIC)
            ->assertJsonPath('publishStatus.frontendStatus', 'ready')
            ->assertJsonPath('publishStatus.backendStatus', 'not_included');

        $projectId = PublishedProject::where('slug', $publish->json('project.id'))->value('id');
        $this->assertDatabaseHas('published_project_deployments', [
            'published_project_id' => $projectId,
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
        ]);
        $this->assertDatabaseMissing('published_project_deployments', [
            'published_project_id' => $projectId,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
        ]);
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

    public function test_python_server_source_may_declare_local_cors_origins(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Python Local CORS',
            'email' => 'python.local.cors@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'python-local-cors',
            'title' => 'Python Local CORS',
            'description' => 'Full stack Python project.',
            'stack' => 'React + FastAPI',
            'tags' => ['python'],
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'startCommand' => 'python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}',
                'files' => [
                    [
                        'path' => 'requirements.txt',
                        'encoding' => 'utf8',
                        'body' => "fastapi\nuvicorn\n",
                    ],
                    [
                        'path' => 'backend/app/main.py',
                        'encoding' => 'utf8',
                        'body' => "origins = ['http://localhost:5173', 'http://127.0.0.1:5173']\n",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();
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
            ->assertJsonPath('code', 'runtime_bundle_incomplete_or_unsafe')
            ->assertJsonPath('error', 'The runtime bundle was incomplete or unsafe.')
            ->assertJsonPath('backendStatus', 'failed')
            ->assertJsonPath('hostedDemoStatus', 'unavailable');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }

    public function test_laravel_runtime_neutralizes_private_urls_in_compiled_assets(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Laravel Compiled Runtime',
            'email' => 'laravel.compiled.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'laravel-compiled-runtime',
            'title' => 'Laravel Compiled Runtime',
            'description' => 'A Laravel runtime with generated frontend assets.',
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'laravel',
                'startCommand' => 'php artisan serve --host=0.0.0.0 --port=${PORT}',
                'files' => [
                    [
                        'path' => 'composer.json',
                        'encoding' => 'utf8',
                        'body' => '{"require":{"laravel/framework":"^12.0"}}',
                    ],
                    [
                        'path' => 'public/build/assets/app.js',
                        'encoding' => 'utf8',
                        'body' => 'const fallback="http://localhost";',
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->firstOrFail();
        $asset = collect($deployment->demo_files)->firstWhere('path', 'public/build/assets/app.js');

        $this->assertStringContainsString('about:blank', (string) ($asset['body'] ?? ''));
        $this->assertStringNotContainsString('localhost', (string) ($asset['body'] ?? ''));
    }

    public function test_runtime_bundle_limit_returns_precise_hosting_error(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Too Large',
            'email' => 'runtime.too.large@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-too-large',
            'title' => 'Runtime Too Large',
            'description' => 'A project beyond the hosting limit.',
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => false,
                'code' => 'runtime_bundle_limit_exceeded',
                'metadata' => ['truncated' => true],
                'files' => [],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'runtime_bundle_limit_exceeded')
            ->assertJsonPath('error', 'This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.')
            ->assertJsonPath('hostedDemoStatus', 'unavailable')
            ->assertJsonPath('frontendStatus', 'unavailable')
            ->assertJsonPath('backendStatus', 'failed');
    }

    public function test_static_bundle_limit_returns_precise_hosting_error(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Frontend Too Large',
            'email' => 'frontend.too.large@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'frontend-too-large',
            'title' => 'Frontend Too Large',
            'description' => 'A frontend beyond the hosted bundle limit.',
            'visibility' => 'public',
            'hostedDemo' => [
                'ok' => false,
                'code' => 'bundle_limit_exceeded',
                'reason' => 'Static demo bundle reached its file limit.',
                'metadata' => ['truncated' => true],
                'files' => [],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'bundle_limit_exceeded')
            ->assertJsonPath('error', 'This frontend is too large for Vibyra hosting, so we can’t host it. Remove unnecessary build files or open a smaller app folder, then try again.')
            ->assertJsonPath('frontendStatus', 'failed')
            ->assertJsonPath('backendStatus', 'not_included');
    }

    public function test_fastapi_full_stack_bundle_keeps_built_frontend_files(): void
    {
        $this->fakeCleanModeration();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'FastAPI Full Stack',
            'email' => 'fastapi.fullstack@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'fastapi-full-stack',
            'title' => 'FastAPI Full Stack',
            'description' => 'A FastAPI API with a built Vite frontend.',
            'stack' => 'FastAPI + React',
            'sourceFiles' => [
                ['path' => 'backend/app/main.py', 'language' => 'python', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'buildCommand' => 'pip install -r requirements.txt',
                'startCommand' => 'python -m uvicorn _vibyra_runtime:app --host 0.0.0.0 --port ${PORT}',
                'metadata' => ['frontendDistDirectory' => 'frontend/dist'],
                'files' => [
                    ['path' => 'requirements.txt', 'encoding' => 'utf8', 'body' => "fastapi==0.115.0\nuvicorn==0.34.0\n"],
                    ['path' => 'backend/app/main.py', 'encoding' => 'utf8', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
                    ['path' => '_vibyra_runtime.py', 'encoding' => 'utf8', 'body' => "from backend.app.main import app\n"],
                    ['path' => 'frontend/dist/index.html', 'encoding' => 'utf8', 'body' => '<!doctype html><script src="/assets/app.js"></script>'],
                    ['path' => 'frontend/dist/assets/app.js', 'encoding' => 'utf8', 'body' => "fetch('/health');"],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.frontendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendStatus', 'pending');

        $deployment = PublishedProjectDeployment::where(
            'published_project_id',
            PublishedProject::where('slug', $publish->json('project.id'))->value('id')
        )->firstOrFail();

        $this->assertSame('frontend/dist', $deployment->metadata['frontendDistDirectory'] ?? null);
        $this->assertContains('frontend/dist/index.html', collect($deployment->demo_files)->pluck('path')->all());
        $this->assertContains('frontend/dist/assets/app.js', collect($deployment->demo_files)->pluck('path')->all());
    }

    public function test_generated_full_stack_assets_are_not_scanned_as_source_code(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Generated Asset Review',
            'email' => 'generated.asset.review@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'generated-full-stack-assets',
            'title' => 'Generated Full-stack Assets',
            'description' => 'A clean FastAPI and React project.',
            'stack' => 'React + FastAPI',
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'startCommand' => 'python -m uvicorn _vibyra_runtime:app --host 0.0.0.0 --port ${PORT}',
                'metadata' => ['frontendDistDirectory' => 'frontend/dist'],
                'files' => [
                    ['path' => 'requirements.txt', 'encoding' => 'utf8', 'body' => "fastapi\nuvicorn\n"],
                    ['path' => '_vibyra_runtime.py', 'encoding' => 'utf8', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
                    ['path' => 'ml/generate_data.py', 'encoding' => 'utf8', 'body' => 'label = "payment query needs resolution this week"'],
                    ['path' => 'frontend/dist/index.html', 'encoding' => 'utf8', 'body' => '<script src="/assets/app.js"></script>'],
                    ['path' => 'frontend/dist/assets/app.js', 'encoding' => 'utf8', 'body' => 'eval("compiled framework helper")'],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonMissing(['code' => 'dynamic_code_execution'])
            ->assertJsonMissing(['code' => 'auth_payment_surface']);
    }

    public function test_runtime_bundle_is_reviewed_and_preserved_until_manual_approval(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $publisherToken = $this->postJson('/api/auth/signup', [
            'name' => 'Pending Runtime',
            'email' => 'pending.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $reviewerToken = $this->postJson('/api/auth/signup', [
            'name' => 'Reviewer',
            'email' => 'reviewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        User::where('email', 'reviewer@example.com')->firstOrFail()->markEmailAsVerified();

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'pending-runtime',
            'title' => 'Pending Runtime',
            'description' => 'A clean runtime waiting for review.',
            'stack' => 'Express',
            'sourceFiles' => [['path' => 'safe.txt', 'language' => 'text', 'body' => 'safe']],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'startCommand' => 'npm run start',
                'files' => [
                    ['path' => 'package.json', 'encoding' => 'utf8', 'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}'],
                    ['path' => 'server.js', 'encoding' => 'utf8', 'body' => "import express from 'express';"],
                ],
            ],
        ], ['Authorization' => "Bearer {$publisherToken}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW);

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();
        $this->assertSame(PublishedProjectDeployment::STATUS_PENDING_REVIEW, $deployment->status);
        $this->assertCount(2, $deployment->demo_files);

        $this->postJson("/api/projects/{$project->slug}/review", [
            'decision' => PublishedProject::REVIEW_APPROVED,
        ], ['Authorization' => "Bearer {$reviewerToken}"])
            ->assertOk()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED);

        $this->assertSame(
            PublishedProjectDeployment::STATUS_QUEUED,
            $deployment->fresh()->status
        );
    }

    public function test_runtime_files_cannot_bypass_source_review(): void
    {
        $this->fakeCleanModeration();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Review',
            'email' => 'runtime.review@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-review',
            'title' => 'Runtime Review',
            'description' => 'The submitted source looks safe.',
            'stack' => 'Express',
            'sourceFiles' => [['path' => 'safe.txt', 'language' => 'text', 'body' => 'safe']],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'startCommand' => 'npm run start',
                'files' => [
                    ['path' => 'package.json', 'encoding' => 'utf8', 'body' => '{"scripts":{"start":"node server.js"}}'],
                    ['path' => 'server.js', 'encoding' => 'utf8', 'body' => 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456";'],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED);
    }
}
