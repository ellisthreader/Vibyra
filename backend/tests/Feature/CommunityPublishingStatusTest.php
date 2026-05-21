<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CommunityPublishingStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_read_and_recheck_own_publish_statuses_that_are_not_public(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
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
}
