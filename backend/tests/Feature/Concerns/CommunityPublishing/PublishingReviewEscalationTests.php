<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\User;
use Illuminate\Support\Facades\Http; 


trait PublishingReviewEscalationTests
{
    public function test_configured_reviewer_can_approve_under_review_project(): void
    {
        config([
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
            'services.openai.key' => 'test-openai-key',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $publisherToken = $this->postJson('/api/auth/signup', [
            'name' => 'Queue Publisher',
            'email' => 'queue.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $reviewerToken = $this->postJson('/api/auth/signup', [
            'name' => 'Reviewer',
            'email' => 'reviewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        User::where('email', 'reviewer@example.com')->firstOrFail()->markEmailAsVerified();

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'queue-project',
            'title' => 'Queue Project',
            'description' => 'A clean project waiting for review.',
            'previewHtml' => '<!doctype html><html><body><h1>Queue</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Queue</h1></body></html>'],
            ],
        ], ['Authorization' => "Bearer {$publisherToken}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW);

        $slug = $publish->json('project.id');

        $this->getJson('/api/projects/review-queue', ['Authorization' => "Bearer {$publisherToken}"])
            ->assertForbidden();
        $this->getJson('/api/projects/review-queue', ['Authorization' => "Bearer {$reviewerToken}"])
            ->assertOk()
            ->assertJsonPath('projects.0.sourceProjectId', 'queue-project');

        $this->postJson("/api/projects/{$slug}/review", [
            'decision' => PublishedProject::REVIEW_APPROVED,
            'reason' => 'Looks safe after review.',
        ], ['Authorization' => "Bearer {$reviewerToken}"])
            ->assertOk()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('isPublic', true)
            ->assertJsonPath('publishStatus.safetyRating', 'caution');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug);
    }

    public function test_publish_goes_under_review_when_preview_html_is_too_large(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
        ]);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Large Preview',
            'email' => 'large.preview@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'large-preview',
            'title' => 'Large Preview',
            'description' => 'A clean project with a very large preview.',
            'previewHtml' => '<!doctype html><html><body><h1>'.str_repeat('A', 181000).'</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('isPublic', false)
            ->assertJsonPath('safetyFindings.0.code', 'preview_html_too_large');

        $project = PublishedProject::where('source_project_id', 'large-preview')->firstOrFail();
        $this->assertSame(PublishedProject::REVIEW_UNDER_REVIEW, $project->review_status);
        $this->assertLessThanOrEqual(180000, strlen((string) $project->preview_html));

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")->assertNotFound();
        Http::assertSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/moderations');
    }
}
