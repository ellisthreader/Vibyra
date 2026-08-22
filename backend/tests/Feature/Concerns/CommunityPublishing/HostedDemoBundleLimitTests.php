<?php

namespace Tests\Feature\Concerns\CommunityPublishing;


trait HostedDemoBundleLimitTests
{
    public function test_runtime_bundle_limit_returns_precise_hosting_error(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Too Large',
            'email' => 'runtime.too.large@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-too-large',
            'title' => 'Runtime Too Large',
            'description' => 'A project beyond the hosting limit.',
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => false,
                'code' => 'runtime_bundle_limit_exceeded',
                'metadata' => ['truncated' => true],
                'files' => [],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'runtime_bundle_limit_exceeded')
            ->assertJsonPath('error', 'This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.')
            ->assertJsonPath('hostedDemoStatus', 'unavailable')
            ->assertJsonPath('frontendStatus', 'unavailable')
            ->assertJsonPath('backendStatus', 'failed');
    }

    public function test_static_bundle_limit_returns_precise_hosting_error(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Frontend Too Large',
            'email' => 'frontend.too.large@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'frontend-too-large',
            'title' => 'Frontend Too Large',
            'description' => 'A frontend beyond the hosted bundle limit.',
            'visibility' => 'public',
            'hostedDemo' => [
                'ok' => false,
                'code' => 'bundle_limit_exceeded',
                'reason' => 'Static demo bundle reached its file limit.',
                'metadata' => ['truncated' => true],
                'files' => [],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'bundle_limit_exceeded')
            ->assertJsonPath('error', 'This frontend is too large for Vibyra hosting, so we can’t host it. Remove unnecessary build files or open a smaller app folder, then try again.')
            ->assertJsonPath('frontendStatus', 'failed')
            ->assertJsonPath('backendStatus', 'not_included');
    }
}
