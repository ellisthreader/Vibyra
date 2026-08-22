<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment; 


trait HostedDemoRuntimeQueueTests
{
    public function test_runtime_bundle_creates_queued_railway_deployment_without_public_url(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Builder',
            'email' => 'runtime.builder@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-builder',
            'title' => 'Runtime Builder',
            'description' => 'A clean Express app that needs backend hosting.',
            'stack' => 'Express',
            'sourceFiles' => [
                ['path' => 'package.json', 'language' => 'json', 'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}'],
                ['path' => 'server.js', 'language' => 'js', 'body' => "import express from 'express';"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'buildCommand' => '',
                'startCommand' => 'npm run start',
                'runtimeReason' => 'package.json has a start script.',
                'files' => [
                    [
                        'path' => 'package.json',
                        'contentType' => 'application/json; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}',
                    ],
                    [
                        'path' => 'server.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "import express from 'express';",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.hostingMode', PublishedProjectDeployment::MODE_RAILWAY)
            ->assertJsonPath('publishStatus.deploymentStatus', PublishedProjectDeployment::STATUS_QUEUED)
            ->assertJsonPath('publishStatus.hostedDemoStatus', 'pending')
            ->assertJsonPath('publishStatus.isPublic', false)
            ->assertJsonPath('publishStatus.isDiscoverable', false)
            ->assertJsonPath('publishStatus.isOpenable', false)
            ->assertJsonPath('publishStatus.listingState', 'building')
            ->assertJsonPath('publishStatus.currentReleaseState', null)
            ->assertJsonPath('publishStatus.candidateReleaseState', 'building')
            ->assertJsonPath('publishStatus.currentPublicUrl', null)
            ->assertJsonPath('publishStatus.candidateError', null)
            ->assertJsonPath('publishStatus.allowedActions.0', 'update_listing')
            ->assertJsonStructure([
                'publishStatus' => ['deploymentCreatedAt', 'deploymentUpdatedAt'],
            ])
            ->assertJsonPath('publishStatus.publicUrl', null);

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();

        $this->assertSame(PublishedProjectDeployment::PROVIDER_RAILWAY, $deployment->provider);
        $this->assertSame(PublishedProjectDeployment::STATUS_QUEUED, $deployment->status);
        $this->assertSame('npm run start', $deployment->start_command);
        $this->assertCount(2, $deployment->demo_files);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }

    public function test_laravel_runtime_bundle_creates_queued_railway_deployment(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Laravel Runtime',
            'email' => 'laravel.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'laravel-runtime',
            'title' => 'Laravel Runtime',
            'description' => 'A clean Laravel app that needs backend hosting.',
            'stack' => 'Laravel',
            'sourceFiles' => [
                ['path' => 'composer.json', 'language' => 'json', 'body' => '{"require":{"laravel/framework":"^12.0"}}'],
                ['path' => 'routes/web.php', 'language' => 'php', 'body' => "<?php\nRoute::get('/', fn () => 'Demo');"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'laravel',
                'buildCommand' => 'composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader',
                'startCommand' => 'mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}',
                'runtimeReason' => 'Laravel app with Vite assets.',
                'files' => [
                    [
                        'path' => 'composer.json',
                        'contentType' => 'application/json; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => '{"require":{"laravel/framework":"^12.0"}}',
                    ],
                    [
                        'path' => 'artisan',
                        'contentType' => 'text/plain; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "#!/usr/bin/env php\n<?php",
                    ],
                    [
                        'path' => 'public/build/assets/app.js',
                        'contentType' => 'application/javascript; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "console.log('demo');",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.hostingMode', PublishedProjectDeployment::MODE_RAILWAY)
            ->assertJsonPath('publishStatus.deploymentStatus', PublishedProjectDeployment::STATUS_QUEUED)
            ->assertJsonPath('publishStatus.frontendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendStatus', 'pending');

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();

        $this->assertSame(PublishedProjectDeployment::PROVIDER_RAILWAY, $deployment->provider);
        $this->assertSame('laravel', $deployment->metadata['platform'] ?? null);
        $this->assertTrue($deployment->metadata['frontendIncluded'] ?? false);
        $this->assertSame('mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}', $deployment->start_command);
        $this->assertCount(3, $deployment->demo_files);
    }
}
