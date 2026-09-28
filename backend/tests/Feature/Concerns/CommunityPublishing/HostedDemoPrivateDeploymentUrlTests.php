<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use Illuminate\Support\Facades\Http; 


trait HostedDemoPrivateDeploymentUrlTests
{
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
}
