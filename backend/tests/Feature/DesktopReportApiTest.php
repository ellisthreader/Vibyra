<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DesktopReportApiTest extends TestCase
{
    use RefreshDatabase;

    private const WEBHOOK = 'https://discord.com/api/webhooks/123/test-token';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.vibyra_reports.webhook_url' => self::WEBHOOK]);
    }

    public function test_report_requires_a_signed_in_account(): void
    {
        Http::fake();

        $this->post('/api/reports', ['report' => json_encode($this->report())])
            ->assertUnauthorized();

        Http::assertNothingSent();
    }

    public function test_valid_report_uses_server_identity_and_forwards_attachments(): void
    {
        $sent = null;
        Http::fake(function (ClientRequest $request) use (&$sent) {
            $sent = $request;

            return Http::response('', 204);
        });
        $token = $this->signup();
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');

        $response = $this->withToken($token)->post('/api/reports', [
            'report' => json_encode($this->report()),
            'screenshot' => UploadedFile::fake()->createWithContent('screen.png', $png),
            'images' => [UploadedFile::fake()->createWithContent('evidence.png', $png)],
        ]);

        $response->assertOk()->assertJsonPath('ok', true);
        $this->assertMatchesRegularExpression('/^VR-[A-HJ-NP-TV-Z2-9]{6}$/', $response->json('reportId'));
        $this->assertInstanceOf(ClientRequest::class, $sent);
        $this->assertSame(self::WEBHOOK, $sent->url());
        $this->assertTrue($sent->isMultipart());
        $payload = json_decode($this->part($sent, 'payload_json'), true);
        $this->assertStringContainsString('reporter@example.test', $payload['embeds'][0]['author']['name']);
        $this->assertStringNotContainsString('Spoofed Reporter', $payload['embeds'][0]['author']['name']);
        $this->assertSame([], $payload['allowed_mentions']['parse']);
        $this->assertSame('attachment://screenshot.png', $payload['embeds'][0]['image']['url']);
        $this->assertNotSame('', $this->part($sent, 'files[0]'));
        $this->assertStringContainsString('Account ID', $this->part($sent, 'files[1]'));
        $this->assertNotSame('', $this->part($sent, 'files[2]'));
    }

    public function test_invalid_or_unconfigured_webhook_fails_closed(): void
    {
        Http::fake();
        config(['services.vibyra_reports.webhook_url' => 'https://example.com/collect']);

        $this->withToken($this->signup())->withHeader('Accept', 'application/json')->post('/api/reports', [
            'report' => json_encode($this->report()),
        ])->assertStatus(503)->assertJsonPath('ok', false);

        Http::assertNothingSent();
    }

    public function test_report_fields_and_files_are_bounded_before_delivery(): void
    {
        Http::fake();
        $report = $this->report();
        $report['summary'] = '';

        $this->withToken($this->signup())->withHeader('Accept', 'application/json')->post('/api/reports', [
            'report' => json_encode($report),
            'images' => array_map(
                fn (int $index) => UploadedFile::fake()->create("image-{$index}.png", 1, 'image/png'),
                range(1, 5),
            ),
        ])->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_report_json_must_be_an_object(): void
    {
        Http::fake();

        $this->withToken($this->signup())->withHeader('Accept', 'application/json')
            ->post('/api/reports', ['report' => json_encode('not an object')])
            ->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_discord_failure_is_safe_for_the_user(): void
    {
        Http::fake([self::WEBHOOK => Http::response('secret provider detail', 404)]);

        $this->withToken($this->signup())->post('/api/reports', [
            'report' => json_encode($this->report()),
        ])->assertStatus(503)
            ->assertJsonMissing(['error' => 'secret provider detail'])
            ->assertJsonPath('error', 'Reporting is temporarily unavailable. Try again shortly.');
    }

    private function signup(): string
    {
        return (string) $this->postJson('/api/auth/signup', [
            'name' => 'Report User',
            'email' => 'reporter@example.test',
            'password' => 'safe-test-password',
            'deviceName' => 'Vibyra Desktop',
        ])->assertCreated()->json('token');
    }

    private function report(): array
    {
        return [
            'kind' => 'bug', 'severity' => 'high',
            'summary' => 'Terminal goes blank', 'details' => 'The pane disappeared after resize.',
            'steps' => 'Open a pane and resize it.', 'expected' => 'The pane should remain visible.',
            'area' => 'Terminal pane', 'contact' => null, 'terminalTail' => 'last terminal line',
            'context' => [
                'appVersion' => '0.1.6', 'platform' => 'linux · x86_64',
                'project' => 'Vibyra', 'projectRoot' => '/private/project/path',
                'agent' => 'codex', 'model' => 'gpt-5', 'reporter' => 'Spoofed Reporter',
            ],
        ];
    }

    private function part(ClientRequest $request, string $name): string
    {
        foreach ($request->data() as $part) {
            if (($part['name'] ?? null) === $name) {
                return (string) ($part['contents'] ?? '');
            }
        }

        return '';
    }
}
