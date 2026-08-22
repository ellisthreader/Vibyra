<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Facades\Http; 


trait HostedDemoStaticUrlSafetyTests
{
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
}
