<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CommunityPublishingStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_read_and_recheck_own_publish_statuses_that_are_not_public(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::sequence()
                ->push(['error' => ['message' => 'Unavailable']], 503)
                ->push([
                    'results' => [[
                        'flagged' => false,
                        'categories' => [],
                        'category_scores' => [],
                    ]],
                ], 200),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Status Owner',
            'email' => 'status.owner@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'status-project',
            'title' => 'Status Project',
            'description' => 'A clean project waiting for moderation.',
            'previewHtml' => '<!doctype html><html><body><h1>Status</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Status</h1></body></html>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('publishStatus.sourceProjectId', 'status-project')
            ->assertJsonPath('publishStatus.reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW);

        $this->postJson('/api/projects/publish', [
            'projectId' => 'status-project',
            'title' => 'Status Project Again',
            'description' => 'Rechecking after automated review is available.',
            'previewHtml' => '<!doctype html><html><body><h1>Status</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Status</h1></body></html>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('publishStatus.reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('publishStatus.isPublic', true);

        $this->getJson('/api/projects/publish-status', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('projects.0.sourceProjectId', 'status-project')
            ->assertJsonPath('projects.0.reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('projects.0.isPublic', true);
    }

    public function test_owner_can_manage_published_project_listing(): void
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

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Listing Owner',
            'email' => 'listing.owner@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'listing-project',
            'title' => 'Listing Project',
            'description' => 'A clean app with owner actions.',
            'stack' => 'React',
            'tags' => ['dashboard', 'owner'],
            'previewHtml' => '<!doctype html><html><body><h1>Listing</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Listing</h1></body></html>'],
            ],
        ], $headers)->assertCreated();

        $slug = $publish->json('project.id');

        $this->getJson('/api/projects/publish-status', $headers)
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug)
            ->assertJsonPath('projects.0.sourceProjectId', 'listing-project')
            ->assertJsonPath('projects.0.viewerCanManage', true)
            ->assertJsonPath('projects.0.description', 'A clean app with owner actions.')
            ->assertJsonPath('projects.0.tags.0', 'dashboard');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.viewerCanManage', false);

        $this->getJson('/api/community/projects', $headers)
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug)
            ->assertJsonPath('projects.0.viewerCanManage', true)
            ->assertJsonPath('projects.0.sourceProjectId', 'listing-project');

        $this->patchJson("/api/projects/{$slug}/publish", ['visibility' => 'private'], $headers)
            ->assertOk()
            ->assertJsonPath('publishStatus.visibility', 'private')
            ->assertJsonPath('publishStatus.isPublic', false);

        $this->getJson('/api/community/projects', $headers)
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->patchJson("/api/projects/{$slug}/publish", ['visibility' => 'public'], $headers)
            ->assertOk()
            ->assertJsonPath('publishStatus.visibility', 'public')
            ->assertJsonPath('publishStatus.isPublic', true);

        $this->deleteJson("/api/projects/{$slug}/publish", [], $headers)
            ->assertOk()
            ->assertJsonPath('deleted', true)
            ->assertJsonPath('sourceProjectId', 'listing-project');

        $this->getJson('/api/projects/publish-status', $headers)
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }

    public function test_owner_can_update_listing_metadata_without_review_or_deployment_changes(): void
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

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Metadata Owner',
            'email' => 'metadata.owner@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'metadata-project',
            'title' => 'Original Listing',
            'description' => 'The original listing description.',
            'stack' => 'React',
            'tags' => ['original'],
            'previewHtml' => '<!doctype html><html><body><h1>Original release</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<h1>Original release</h1>'],
            ],
        ], $headers)->assertCreated();

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();
        $currentPublicUrl = $publish->json('publishStatus.currentPublicUrl');
        $reviewKeys = [
            'review_status',
            'review_reason',
            'review_flags',
            'review_summary',
            'safety_rating',
            'safety_score',
            'reviewed_at',
            'published_at',
        ];
        $reviewState = array_combine(
            $reviewKeys,
            array_map(fn (string $key) => $project->getRawOriginal($key), $reviewKeys)
        );

        $this->patchJson("/api/projects/{$project->slug}/listing", [
            'title' => 'Updated Listing',
            'description' => 'Updated metadata without rebuilding the app.',
            'tags' => ['updated', 'showcase'],
            'logoImageUrl' => 'https://cdn.example.com/logo.png',
            'screenshotUrls' => ['https://cdn.example.com/screen.png'],
            'sourceFiles' => [['path' => 'ignored.php', 'body' => 'unsafe source is not reviewed here']],
            'previewHtml' => '<script>ignored()</script>',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('action', 'listing_updated')
            ->assertJsonPath('project.title', 'Updated Listing')
            ->assertJsonPath('project.description', 'Updated metadata without rebuilding the app.')
            ->assertJsonPath('project.logoImageUrl', 'https://cdn.example.com/logo.png')
            ->assertJsonPath('project.screenshotUrls.0', 'https://cdn.example.com/screen.png')
            ->assertJsonPath('publishStatus.currentReleaseState', 'live')
            ->assertJsonPath('publishStatus.currentPublicUrl', $currentPublicUrl)
            ->assertJsonPath('publishStatus.listingState', 'live');

        $project->refresh();
        $this->assertSame(
            $reviewState,
            array_combine(
                $reviewKeys,
                array_map(fn (string $key) => $project->getRawOriginal($key), $reviewKeys)
            )
        );
        $this->assertSame(1, PublishedProjectDeployment::where('published_project_id', $project->id)->count());
        $this->assertSame($deployment->id, PublishedProjectDeployment::where('published_project_id', $project->id)->value('id'));
        $this->assertStringContainsString('Original release', (string) $project->preview_html);
    }
}
