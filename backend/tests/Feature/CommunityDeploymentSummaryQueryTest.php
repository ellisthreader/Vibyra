<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommunityDeploymentSummaryQueryTest extends TestCase
{
    use RefreshDatabase;

    public function test_community_listing_preserves_static_openability_without_loading_artifacts(): void
    {
        $user = User::factory()->create();
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'summary-query',
            'slug' => 'summary-query',
            'title' => 'Summary Query',
            'description' => 'A static project.',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);
        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'hosting_mode' => PublishedProjectDeployment::MODE_STATIC,
            'entry_path' => 'index.html',
            'demo_files' => [[
                'path' => 'index.html',
                'encoding' => 'utf8',
                'body' => '<h1>Large artifact remains outside the listing result</h1>',
            ]],
            'hosted_at' => now(),
        ]);

        $summary = PublishedProjectDeployment::query()->summary()->firstOrFail();
        $this->assertArrayNotHasKey('demo_files', $summary->getAttributes());
        $this->assertTrue($summary->hasInlineArtifact());

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.id', 'summary-query')
            ->assertJsonPath('projects.0.frontendStatus', 'ready');
    }
}
