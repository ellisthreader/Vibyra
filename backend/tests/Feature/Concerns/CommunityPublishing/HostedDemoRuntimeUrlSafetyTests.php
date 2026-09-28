<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Facades\Http; 


trait HostedDemoRuntimeUrlSafetyTests
{
    public function test_runtime_bundle_with_private_urls_is_rejected(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Private',
            'email' => 'runtime.private@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-private',
            'title' => 'Runtime Private',
            'description' => 'A runtime bundle that points back to localhost.',
            'sourceFiles' => [
                ['path' => 'package.json', 'language' => 'json', 'body' => '{"scripts":{"start":"node server.js"}}'],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'startCommand' => 'npm run start',
                'files' => [
                    [
                        'path' => 'package.json',
                        'contentType' => 'application/json; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '{"scripts":{"start":"node server.js"}}',
                    ],
                    [
                        'path' => 'server.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "fetch('http://localhost:3000/api')",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'runtime_bundle_incomplete_or_unsafe')
            ->assertJsonPath('error', 'The runtime bundle was incomplete or unsafe.')
            ->assertJsonPath('backendStatus', 'failed')
            ->assertJsonPath('hostedDemoStatus', 'unavailable');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }

    public function test_laravel_runtime_neutralizes_private_urls_in_compiled_assets(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Laravel Compiled Runtime',
            'email' => 'laravel.compiled.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'laravel-compiled-runtime',
            'title' => 'Laravel Compiled Runtime',
            'description' => 'A Laravel runtime with generated frontend assets.',
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'laravel',
                'startCommand' => 'php artisan serve --host=0.0.0.0 --port=${PORT}',
                'files' => [
                    [
                        'path' => 'composer.json',
                        'encoding' => 'utf8',
                        'body' => '{"require":{"laravel/framework":"^12.0"}}',
                    ],
                    [
                        'path' => 'public/build/assets/app.js',
                        'encoding' => 'utf8',
                        'body' => 'const fallback="http://localhost";',
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->firstOrFail();
        $asset = collect($deployment->demo_files)->firstWhere('path', 'public/build/assets/app.js');

        $this->assertStringContainsString('about:blank', (string) ($asset['body'] ?? ''));
        $this->assertStringNotContainsString('localhost', (string) ($asset['body'] ?? ''));
    }
}
