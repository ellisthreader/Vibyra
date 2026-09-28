<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User; 


trait HostedDemoReleaseFallbackTests
{
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
}
