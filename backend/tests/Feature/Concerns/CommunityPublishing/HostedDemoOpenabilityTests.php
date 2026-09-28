<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User; 


trait HostedDemoOpenabilityTests
{
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
}
