<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment; 


trait HostedDemoPackagingFallbackTests
{
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
}
