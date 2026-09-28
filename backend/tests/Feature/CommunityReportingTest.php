<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectReport;
use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CommunityReportingTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_requires_an_authenticated_app_session(): void
    {
        [, , $project] = $this->reportingContext('anonymous');

        $this->postJson("/api/community/projects/{$project->slug}/reports", [
            'reason' => 'unsafe_content',
        ])->assertUnauthorized();

        $this->assertDatabaseCount('published_project_reports', 0);
    }

    public function test_user_can_submit_private_bounded_report_evidence(): void
    {
        [$token, $user, $project] = $this->reportingContext('valid');
        $screenshot = $this->tinyPngDataUrl();

        $response = $this->postJson("/api/community/projects/{$project->slug}/reports", [
            'reason' => 'broken_app',
            'details' => 'The preview stops after opening the dashboard.',
            'screenshot' => $screenshot,
        ], $this->headers($token));

        $response->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('report.status', PublishedProjectReport::STATUS_PENDING);
        $this->assertDatabaseHas('published_project_reports', [
            'published_project_id' => $project->id,
            'reporter_user_id' => $user->id,
            'reason' => 'broken_app',
            'details' => 'The preview stops after opening the dashboard.',
            'screenshot_data_url' => $screenshot,
            'status' => PublishedProjectReport::STATUS_PENDING,
        ]);
        $this->assertArrayNotHasKey('screenshot_data_url', PublishedProjectReport::firstOrFail()->toArray());
        $this->getJson('/api/community/projects')->assertJsonMissingPath('projects.0.reports');
    }

    public function test_invalid_or_oversized_report_evidence_is_rejected_without_persistence(): void
    {
        [$token, , $project] = $this->reportingContext('invalid');
        $endpoint = "/api/community/projects/{$project->slug}/reports";

        $this->postJson($endpoint, ['reason' => 'not_allowed'], $this->headers($token))
            ->assertUnprocessable();
        $this->postJson($endpoint, [
            'reason' => 'other',
            'details' => str_repeat('a', 1001),
        ], $this->headers($token))->assertUnprocessable();
        $this->postJson($endpoint, [
            'reason' => 'other',
            'screenshot' => 'data:image/png;base64,'.base64_encode(str_repeat('a', 2 * 1024 * 1024 + 1)),
        ], $this->headers($token))->assertUnprocessable();

        $this->assertDatabaseCount('published_project_reports', 0);
    }

    public function test_reports_are_rate_limited_per_user_and_project(): void
    {
        [$token, , $project] = $this->reportingContext('rate');
        $endpoint = "/api/community/projects/{$project->slug}/reports";

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->postJson($endpoint, ['reason' => 'spam_or_scam'], $this->headers($token))
                ->assertCreated();
        }

        $this->postJson($endpoint, ['reason' => 'spam_or_scam'], $this->headers($token))
            ->assertTooManyRequests()
            ->assertJsonStructure(['retryAfter']);
        $this->assertDatabaseCount('published_project_reports', 3);
    }

    private function reportingContext(string $suffix): array
    {
        $user = User::factory()->create(['email' => "report-{$suffix}@example.com"]);
        $token = Str::random(72);
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'device_name' => 'Report test device',
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit',
            'last_used_at' => now(),
            'idle_expires_at' => now()->addHour(),
            'absolute_expires_at' => now()->addDay(),
        ]);
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => "source-{$suffix}",
            'slug' => "reportable-{$suffix}",
            'title' => 'Reportable app',
            'description' => 'A public app used for report tests.',
            'preview_html' => '<!doctype html><html><body><h1>Working app</h1></body></html>',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        return [$token, $user, $project];
    }

    private function headers(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }

    private function tinyPngDataUrl(): string
    {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    }
}
