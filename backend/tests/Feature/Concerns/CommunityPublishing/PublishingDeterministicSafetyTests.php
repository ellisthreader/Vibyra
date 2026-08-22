<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\User;
use Illuminate\Support\Facades\Http; 


trait PublishingDeterministicSafetyTests
{
    public function test_publish_with_unsafe_preview_is_denied_and_hidden(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Unsafe Publisher',
            'email' => 'unsafe.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'unsafe-preview',
            'title' => 'Unsafe Preview',
            'description' => 'A project with unsafe preview HTML.',
            'previewHtml' => '<!doctype html><html><body><script>alert(1)</script><h1>Bad</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED)
            ->assertJsonPath('safetyFindings.0.code', 'inline_script_content');

        $project = PublishedProject::where('source_project_id', 'unsafe-preview')->firstOrFail();
        $this->assertSame(PublishedProject::REVIEW_DENIED, $project->review_status);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$project->slug}/preview")->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_publish_goes_under_review_when_remote_moderation_is_unavailable(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Manual Review',
            'email' => 'manual.review@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'manual-review',
            'title' => 'Pending Portal',
            'description' => 'A clean project that needs moderation service review.',
            'previewHtml' => '<!doctype html><html><body><h1>Pending</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Pending</h1></body></html>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('isPublic', false)
            ->assertJsonPath('safetyRating', 'needs_review')
            ->assertJsonPath('safetyScore', 82);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")->assertNotFound();
    }

    public function test_publish_reviews_source_files_for_rating_and_secrets(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Source Reviewer',
            'email' => 'source.reviewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'source-secret',
            'title' => 'Source Secret',
            'description' => 'A project with a leaked source secret.',
            'previewHtml' => '<!doctype html><html><body><h1>Source</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'src/config.ts', 'language' => 'ts', 'body' => 'export const key = "sk-abcdefghijklmnopqrstuvwxyz123456";'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED)
            ->assertJsonPath('safetyRating', 'blocked');

        $project = PublishedProject::where('source_project_id', 'source-secret')->firstOrFail();
        $this->assertContains('openai_key', collect($project->review_flags)->pluck('code')->all());
        $this->assertSame('blocked', $project->safety_rating);
    }

    public function test_deterministic_review_scores_source_risk_patterns(): void
    {
        config(['moderation.publish_ai_review.enabled' => false]);
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Risk Patterns',
            'email' => 'risk.patterns@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $cases = [
            ['external-api', 'src/api.ts', 'fetch("https://example.com/collect", { method: "POST" });', 'untrusted_network_endpoint', 86, 'caution'],
            ['camera-api', 'src/camera.ts', 'navigator.mediaDevices.getUserMedia({ video: true });', 'sensitive_browser_api', 88, 'caution'],
            ['install-script', 'package.json', '{"scripts":{"postinstall":"node setup.js"}}', 'dependency_install_script', 84, 'caution'],
            ['encoded-blob', 'src/blob.js', 'const data = "'.str_repeat('A', 3200).'";', 'minified_large_blob', 76, 'caution'],
            ['destructive-op', 'src/cleanup.js', 'import fs from "fs"; fs.rmSync("/tmp/cache", { recursive: true });', 'destructive_file_operation', 66, 'needs_review'],
        ];

        foreach ($cases as [$projectId, $path, $body, $code, $score, $rating]) {
            $this->postJson('/api/projects/publish', [
                'projectId' => $projectId,
                'title' => 'Risk '.$projectId,
                'description' => 'A project with a deterministic source risk.',
                'previewHtml' => '<!doctype html><html><body><h1>Risk</h1></body></html>',
                'sourceFiles' => [['path' => $path, 'language' => 'js', 'body' => $body]],
            ], ['Authorization' => "Bearer {$token}"])
                ->assertAccepted()
                ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
                ->assertJsonPath('safetyScore', $score)
                ->assertJsonPath('safetyRating', $rating);

            $project = PublishedProject::where('source_project_id', $projectId)->firstOrFail();
            $this->assertContains($code, collect($project->review_flags)->pluck('code')->all());
        }
    }

    public function test_missing_source_and_moderation_gap_is_not_labeled_high_risk(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Confidence Gap',
            'email' => 'confidence.gap@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'confidence-gap',
            'title' => 'Confidence Gap',
            'description' => 'A clean project where automated checks are incomplete.',
            'previewHtml' => '<!doctype html><html><body><h1>Gap</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('safetyRating', 'needs_review')
            ->assertJsonPath('safetyScore', 58);
    }
}
