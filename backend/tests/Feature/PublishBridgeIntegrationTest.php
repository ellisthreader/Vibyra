<?php

namespace Tests\Feature;

use App\Models\PublishedProjectDeployment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PublishBridgeIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_desktop_bridge_payload_publishes_with_precise_statuses_and_errors(): void
    {
        $payloadPath = getenv('VIBYRA_PUBLISH_SMOKE_PAYLOAD') ?: '';
        if ($payloadPath === '' || ! is_file($payloadPath)) {
            $this->markTestSkipped('Run through desktop/lib/publishIntegration.test.mjs.');
        }

        $payload = json_decode((string) file_get_contents($payloadPath), true, flags: JSON_THROW_ON_ERROR);
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
            'name' => 'Bridge Publish Smoke',
            'email' => 'bridge.publish.smoke@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $publish = $this->postJson('/api/projects/publish', $payload, $headers)
            ->assertCreated()
            ->assertJsonPath('publishStatus.hostingMode', PublishedProjectDeployment::MODE_RAILWAY)
            ->assertJsonPath('publishStatus.deploymentStatus', PublishedProjectDeployment::STATUS_QUEUED)
            ->assertJsonPath('publishStatus.frontendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendPlatform', 'laravel');

        $this->getJson('/api/projects/publish-status', $headers)
            ->assertOk()
            ->assertJsonPath('projects.0.sourceProjectId', $payload['projectId'])
            ->assertJsonPath('projects.0.frontendStatus', 'pending')
            ->assertJsonPath('projects.0.backendStatus', 'pending');

        $this->postJson('/api/projects/publish', [
            ...$payload,
            'projectId' => 'smoke-invalid-runtime',
            'title' => 'Invalid Runtime',
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'laravel',
                'startCommand' => 'php artisan serve',
                'files' => [],
            ],
        ], $headers)
            ->assertUnprocessable()
            ->assertJsonPath('error', 'The runtime bundle was incomplete or unsafe.')
            ->assertJsonPath('code', 'runtime_bundle_incomplete_or_unsafe')
            ->assertJsonPath('frontendStatus', 'unavailable')
            ->assertJsonPath('backendStatus', 'failed');

        $tooLarge = 'This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.';
        $this->postJson('/api/projects/publish', [
            ...$payload,
            'projectId' => 'smoke-large-runtime',
            'title' => 'Large Runtime',
            'runtimeBundle' => [
                'ok' => false,
                'code' => 'runtime_bundle_limit_exceeded',
                'reason' => $tooLarge,
                'metadata' => ['truncated' => true],
                'files' => [],
            ],
        ], $headers)
            ->assertUnprocessable()
            ->assertJsonPath('error', $tooLarge)
            ->assertJsonPath('code', 'runtime_bundle_limit_exceeded')
            ->assertJsonPath('frontendStatus', 'unavailable')
            ->assertJsonPath('backendStatus', 'failed');

        $this->assertNotEmpty($publish->json('project.id'));
    }
}
