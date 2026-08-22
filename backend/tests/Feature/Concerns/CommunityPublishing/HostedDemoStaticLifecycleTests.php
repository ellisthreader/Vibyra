<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment; 


trait HostedDemoStaticLifecycleTests
{
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
}
