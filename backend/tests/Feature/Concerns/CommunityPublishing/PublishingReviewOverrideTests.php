<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject; 


trait PublishingReviewOverrideTests
{
    public function test_temporary_review_bypass_can_auto_approve_in_production_environment(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config([
            'moderation.publish_force_approve_under_review' => true,
            'moderation.remote_enabled' => false,
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Production Test Publisher',
            'email' => 'production.testing@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'production-testing-project',
            'title' => 'Production Testing Project',
            'description' => 'A temporary review bypass verification.',
            'stack' => 'HTML',
            'previewHtml' => '<!doctype html><html><body><h1>Testing</h1></body></html>',
            'sourceFiles' => [],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('isPublic', true)
            ->assertJsonFragment(['code' => 'temp_publish_force_approved']);
    }

    public function test_temporary_review_disable_skips_deterministic_denial(): void
    {
        config([
            'moderation.publish_review_temporarily_disabled' => true,
            'moderation.remote_enabled' => false,
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Temporary Review Disable',
            'email' => 'review.disabled@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'deterministic-bypass-project',
            'title' => 'Deterministic Bypass Project',
            'description' => 'Temporary launch validation.',
            'stack' => 'React',
            'previewHtml' => '<!doctype html><html><body><h1>Published</h1><script>alert(1)</script></body></html>',
            'sourceFiles' => [
                ['path' => 'src/App.tsx', 'language' => 'tsx', 'body' => 'eval("temporary test");'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('isPublic', true)
            ->assertJsonFragment(['code' => 'temp_publish_review_disabled']);
    }

    public function test_public_publish_rejects_generated_source_preview_shell(): void
    {
        $this->fakeCleanModeration();
        config(['moderation.publish_force_approve_under_review' => true]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Source Preview Publisher',
            'email' => 'source-preview.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $sourcePreview = '<!doctype html><html><body><h2>Project preview</h2><section><h3>routes/web.php</h3><pre><code>&lt;?php Route::get("/", fn () =&gt; "ok");</code></pre></section></body></html>';

        $this->postJson('/api/projects/publish', [
            'projectId' => 'source-preview-project',
            'title' => 'Source Preview Project',
            'description' => 'A folder that only produced the source-code preview shell.',
            'stack' => 'Laravel',
            'previewHtml' => $sourcePreview,
            'sourceFiles' => [
                ['path' => 'routes/web.php', 'language' => 'php', 'body' => '<?php'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('isPublic', false)
            ->assertJsonPath('hostedDemoStatus', 'unavailable');

        $this->assertDatabaseMissing('published_projects', [
            'source_project_id' => 'source-preview-project',
        ]);
    }
}
