<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DesktopReportTest extends TestCase
{
    use RefreshDatabase;

    private const WEBHOOK = 'https://discord.com/api/webhooks/123/fixture-token';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['services.desktop_reports.webhook_url' => self::WEBHOOK]);
    }

    private function token(): string
    {
        $user = User::factory()->create(['name' => 'Reporter Fixture', 'email' => 'reporter@example.test']);
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', 'report-token'),
            'device_name' => 'Fixture Mac',
        ]);

        return 'report-token';
    }

    private function report(bool $diagnostics): array
    {
        return [
            'kind' => 'bug', 'severity' => 'normal', 'summary' => 'A specific problem',
            'details' => 'The pane does not open.', 'error' => 'window failed @everyone',
            'area' => 'Home screen', 'includeDiagnostics' => $diagnostics,
            'context' => [
                'appVersion' => '0.7.9 (build 9)', 'platform' => 'Mac',
                'hardware' => 'Mac16,2; Apple M4; 24 GiB',
                'ip' => '198.51.100.55',
                'reporter' => 'Forged Person (forged@example.test)',
                'project' => 'Private Studio',
                'projectRoot' => '/Users/fixture/private-project',
            ],
        ];
    }

    public function test_report_requires_a_session_and_configured_channel(): void
    {
        $this->getJson('/api/reports/ready')->assertStatus(401);
        $this->post('/api/reports', ['report' => json_encode($this->report(false))])->assertStatus(401);
        $token = $this->token();
        config(['services.desktop_reports.webhook_url' => null]);
        $this->getJson('/api/reports/ready', ['Authorization' => "Bearer {$token}"])
            ->assertOk()->assertJsonPath('ready', false);
    }

    public function test_default_report_names_account_but_omits_ip_and_hardware(): void
    {
        $token = $this->token();
        Http::fake([self::WEBHOOK => Http::response([], 204)]);
        $this->post('/api/reports', [
            'report' => json_encode($this->report(false)),
        ], ['Authorization' => "Bearer {$token}", 'REMOTE_ADDR' => '203.0.113.9'])
            ->assertOk()->assertJsonStructure(['id']);
        Http::assertSent(function ($request) {
            $body = (string) $request->body();
            $parts = collect($request->data())->keyBy('name');
            $payload = json_decode($parts['payload_json']['contents'] ?? '{}', true);
            $fields = collect($payload['embeds'][0]['fields'] ?? [])->pluck('value', 'name');

            return str_contains($body, 'A specific problem')
                && str_contains($body, 'allowed_mentions')
                && ($fields['Platform'] ?? null) === 'Mac'
                && ($fields['Username'] ?? null) === 'Reporter Fixture'
                && ($fields['Email'] ?? null) === 'reporter@example.test'
                && ($payload['embeds'][0]['author']['name'] ?? null) === 'Reported by Reporter Fixture (reporter@example.test)'
                && ! str_contains($body, 'forged@example.test')
                && ! str_contains($body, 'Mac16,2')
                && ! str_contains($body, 'Private Studio')
                && ! str_contains($body, 'private-project')
                && ! str_contains($body, '198.51.100.55')
                && ! str_contains($body, '203.0.113.9');
        });
    }

    public function test_consented_report_includes_authoritative_identity_and_hardware(): void
    {
        $token = $this->token();
        Http::fake([self::WEBHOOK => Http::response([], 204)]);
        $this->post('/api/reports', [
            'report' => json_encode($this->report(true)),
        ], [
            'Authorization' => "Bearer {$token}",
            'REMOTE_ADDR' => '100.64.0.5',
            'HTTP_X_REAL_IP' => '8.8.8.8',
        ])->assertOk();
        Http::assertSent(function ($request) {
            $body = (string) $request->body();
            $parts = collect($request->data())->keyBy('name');
            $payload = json_decode($parts['payload_json']['contents'] ?? '{}', true);
            $fields = collect($payload['embeds'][0]['fields'] ?? [])->pluck('value', 'name');

            return ($fields['Username'] ?? null) === 'Reporter Fixture'
                && ($fields['Email'] ?? null) === 'reporter@example.test'
                && ($fields['Version'] ?? null) === '0.7.9 (build 9)'
                && ($fields['Device / hardware'] ?? null) === 'Mac16,2; Apple M4; 24 GiB'
                && ($fields['IP address'] ?? null) === '8.8.8.8'
                && str_contains($body, 'Private Studio')
                && ! str_contains($body, '198.51.100.55')
                && ! str_contains($body, 'forged@example.test');
        });
    }

    public function test_public_socket_ip_cannot_be_overridden_by_a_forwarded_header(): void
    {
        $token = $this->token();
        Http::fake([self::WEBHOOK => Http::response([], 204)]);
        $this->post('/api/reports', ['report' => json_encode($this->report(true))], [
            'Authorization' => "Bearer {$token}",
            'REMOTE_ADDR' => '1.1.1.1',
            'HTTP_X_REAL_IP' => '8.8.8.8',
        ])->assertOk();
        Http::assertSent(fn ($request) => str_contains((string) $request->body(), '1.1.1.1')
            && ! str_contains((string) $request->body(), '8.8.8.8'));
    }

    public function test_invalid_report_never_reaches_discord(): void
    {
        $token = $this->token();
        Http::fake([self::WEBHOOK => Http::response([], 204)]);
        $invalid = $this->report(true);
        $invalid['summary'] = '';
        $this->post('/api/reports', ['report' => json_encode($invalid)],
            ['Authorization' => "Bearer {$token}"])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_non_image_attachment_is_rejected_before_delivery(): void
    {
        $token = $this->token();
        Http::fake([self::WEBHOOK => Http::response([], 204)]);
        $this->post('/api/reports', [
            'report' => json_encode($this->report(false)),
            'screenshot' => UploadedFile::fake()->create('fake.png', 2, 'text/plain'),
        ], ['Authorization' => "Bearer {$token}"])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_valid_screenshot_is_attached_and_referenced(): void
    {
        $token = $this->token();
        Http::fake([self::WEBHOOK => Http::response([], 204)]);
        $this->post('/api/reports', [
            'report' => json_encode($this->report(false)),
            'screenshot' => UploadedFile::fake()->image('screen.png', 12, 12),
        ], ['Authorization' => "Bearer {$token}"])->assertOk();
        Http::assertSent(function ($request) {
            $parts = collect($request->data())->keyBy('name');
            $payload = json_decode($parts['payload_json']['contents'] ?? '{}', true);

            return ($payload['embeds'][0]['image']['url'] ?? null) === 'attachment://screenshot.png'
                && ($parts['files[1]']['filename'] ?? null) === 'screenshot.png'
                && ($payload['allowed_mentions']['parse'] ?? null) === [];
        });
    }

    public function test_an_account_can_submit_at_most_five_reports_per_hour(): void
    {
        $token = $this->token();
        Http::fake([self::WEBHOOK => Http::response([], 204)]);
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->post('/api/reports', ['report' => json_encode($this->report(false))],
                ['Authorization' => "Bearer {$token}"])->assertOk();
        }
        $this->post('/api/reports', ['report' => json_encode($this->report(false))],
            ['Authorization' => "Bearer {$token}"])->assertStatus(429);
        Http::assertSentCount(5);
    }
}
