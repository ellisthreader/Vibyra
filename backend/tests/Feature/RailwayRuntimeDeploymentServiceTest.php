<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use Tests\TestCase;

class RailwayRuntimeDeploymentServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_marks_runtime_deployment_live_after_railway_domain_is_resolved(): void
    {
        config(['services.railway.team_id' => 'team_123']);
        $deployment = $this->runtimeDeployment();
        $calls = [];
        $service = new RailwayRuntimeDeploymentService(function (array $arguments, string $cwd, int $timeout) use (&$calls) {
            $calls[] = [$arguments, $cwd, $timeout];
            if ($arguments[0] === 'up') {
                return ['ok' => true, 'output' => '{"deploymentId":"dep_123"}'];
            }
            if ($arguments[0] === 'status') {
                return ['ok' => true, 'output' => json_encode([
                    'id' => 'project_123',
                    'services' => ['edges' => [['node' => ['id' => 'service_123', 'name' => 'Runtime Demo']]]],
                    'environments' => ['edges' => [['node' => ['serviceInstances' => ['edges' => [[
                        'node' => [
                            'serviceId' => 'service_123',
                            'serviceName' => 'Runtime Demo',
                            'latestDeployment' => ['id' => 'deployment_123'],
                        ],
                    ]]]]]]],
                ])];
            }
            if ($arguments[0] === 'domain') {
                return ['ok' => true, 'output' => '{"domain":"vibyra-demo-1.up.railway.app"}'];
            }

            return ['ok' => false, 'output' => 'unexpected'];
        });

        $result = $service->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $result->status);
        $this->assertSame('https://vibyra-demo-1.up.railway.app', $result->public_url);
        $this->assertSame('project_123', $result->provider_project_id);
        $this->assertNotEmpty($calls);
        $this->assertContains('--workspace', $calls[0][0]);
        $this->assertContains('team_123', $calls[0][0]);
        $statusCall = collect($calls)->first(fn ($call) => ($call[0][0] ?? '') === 'status');
        $this->assertNotContains('--workspace', $statusCall[0] ?? []);
        $domainCall = collect($calls)->first(fn ($call) => ($call[0][0] ?? '') === 'domain');
        $this->assertContains('--environment', $domainCall[0] ?? []);
        $this->assertContains('production', $domainCall[0] ?? []);
    }

    public function test_service_reuses_existing_railway_target_on_retry(): void
    {
        $deployment = $this->runtimeDeployment();
        $deployment->forceFill([
            'provider_project_id' => 'project_existing',
            'provider_service_id' => 'service_existing',
        ])->save();
        $calls = [];
        $service = new RailwayRuntimeDeploymentService(function (array $arguments) use (&$calls) {
            $calls[] = $arguments;
            if ($arguments[0] === 'up') {
                return ['ok' => true, 'output' => '{"deploymentId":"dep_456"}'];
            }
            if ($arguments[0] === 'status') {
                return ['ok' => true, 'output' => '{"id":"main_backend","url":"https://vibyra-production.up.railway.app"}'];
            }
            if ($arguments[0] === 'domain') {
                return ['ok' => true, 'output' => '{"domain":"retry-demo.up.railway.app"}'];
            }

            return ['ok' => false, 'output' => 'unexpected'];
        });

        $result = $service->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $result->status);
        $this->assertSame('https://retry-demo.up.railway.app', $result->public_url);
        $this->assertNotContains('--new', $calls[0]);
        $this->assertContains('--project', $calls[0]);
        $this->assertContains('project_existing', $calls[0]);
        $this->assertContains('--service', $calls[0]);
        $this->assertContains('service_existing', $calls[0]);
        $this->assertContains('--environment', $calls[0]);
        $this->assertContains('production', $calls[0]);
        $domainCall = collect($calls)->first(fn ($call) => ($call[0] ?? '') === 'domain');
        $this->assertContains('project_existing', $domainCall ?? []);
        $this->assertContains('service_existing', $domainCall ?? []);
    }

    public function test_service_uses_project_list_when_status_lacks_project_id(): void
    {
        config(['services.railway.team_id' => 'workspace_123']);
        $deployment = $this->runtimeDeployment();
        $calls = [];
        $service = new RailwayRuntimeDeploymentService(function (array $arguments) use (&$calls, $deployment) {
            $calls[] = $arguments;
            if ($arguments[0] === 'up') {
                return ['ok' => true, 'output' => '{"deploymentId":"dep_789"}'];
            }
            if ($arguments[0] === 'status') {
                return ['ok' => true, 'output' => json_encode([
                    'environments' => ['edges' => [['node' => ['serviceInstances' => ['edges' => [[
                        'node' => ['latestDeployment' => ['id' => 'deployment_789']],
                    ]]]]]]],
                ])];
            }
            if ($arguments[0] === 'list') {
                return ['ok' => true, 'output' => json_encode([
                    [
                        'workspace' => ['id' => 'workspace_123'],
                        'id' => 'project_old',
                        'name' => 'vibyra-demo-'.$deployment->id,
                        'createdAt' => '2026-06-07T12:00:00.000Z',
                        'services' => ['edges' => [['node' => ['id' => 'service_old', 'name' => 'Old']]]],
                    ],
                    [
                        'workspace' => ['id' => 'workspace_123'],
                        'id' => 'project_new',
                        'name' => 'vibyra-demo-'.$deployment->id,
                        'createdAt' => '2026-06-07T13:00:00.000Z',
                        'services' => ['edges' => [['node' => ['id' => 'service_new', 'name' => 'New']]]],
                    ],
                ])];
            }
            if ($arguments[0] === 'domain') {
                return ['ok' => true, 'output' => '{"domain":"listed-demo.up.railway.app"}'];
            }

            return ['ok' => false, 'output' => 'unexpected'];
        });

        $result = $service->deploy($deployment);

        $domainCall = collect($calls)->first(fn ($call) => ($call[0] ?? '') === 'domain');
        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $result->status);
        $this->assertSame('project_new', $result->provider_project_id);
        $this->assertSame('service_new', $result->provider_service_id);
        $this->assertContains('project_new', $domainCall ?? []);
        $this->assertContains('service_new', $domainCall ?? []);
    }

    public function test_service_fails_runtime_deployment_without_safe_public_url(): void
    {
        $deployment = $this->runtimeDeployment();
        $service = new RailwayRuntimeDeploymentService(function (array $arguments) {
            if ($arguments[0] === 'up' || $arguments[0] === 'status') {
                return ['ok' => true, 'output' => '{}'];
            }

            return ['ok' => false, 'output' => 'no domain'];
        });

        $result = $service->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_FAILED, $result->status);
        $this->assertNull($result->public_url);
        $this->assertStringContainsString('public HTTPS demo URL', (string) $result->last_error);
    }

    public function test_service_writes_laravel_demo_env_and_build_config(): void
    {
        $deployment = $this->runtimeDeployment([
            'platform' => 'laravel',
            'buildCommand' => 'composer install --no-dev',
            'startCommand' => 'php artisan serve --host=0.0.0.0 --port=${PORT}',
            'files' => [
                [
                    'path' => 'composer.json',
                    'encoding' => 'utf8',
                    'body' => '{"require":{"laravel/framework":"^12.0"}}',
                ],
                [
                    'path' => 'artisan',
                    'encoding' => 'utf8',
                    'body' => "#!/usr/bin/env php\n<?php",
                ],
                [
                    'path' => 'public/index.php',
                    'encoding' => 'utf8',
                    'body' => "<?php\n\nuse Illuminate\\Http\\Request;\n",
                ],
            ],
        ]);
        $captured = [];
        $service = new RailwayRuntimeDeploymentService(function (array $arguments, string $cwd) use (&$captured) {
            if ($arguments[0] === 'up') {
                $captured['env'] = file_get_contents($cwd.'/.env');
                $captured['index'] = file_get_contents($cwd.'/public/index.php');
                $captured['railway'] = json_decode(file_get_contents($cwd.'/railway.json'), true);
                $captured['cachePlaceholder'] = file_get_contents($cwd.'/bootstrap/cache/.gitignore');

                return ['ok' => true, 'output' => '{"deploymentId":"dep_123"}'];
            }
            if ($arguments[0] === 'status') {
                return ['ok' => true, 'output' => '{"id":"project_123","url":"https://laravel-demo.up.railway.app"}'];
            }

            return ['ok' => false, 'output' => 'unexpected'];
        });

        $result = $service->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $result->status);
        $this->assertStringContainsString('APP_KEY=base64:', $captured['env'] ?? '');
        $this->assertStringContainsString('DB_CONNECTION=sqlite', $captured['env'] ?? '');
        $this->assertStringNotContainsString('APP_URL=', $captured['env'] ?? '');
        $this->assertStringNotContainsString('ASSET_URL=', $captured['env'] ?? '');
        $this->assertStringContainsString('HTTP_X_FORWARDED_PROTO', $captured['index'] ?? '');
        $this->assertStringContainsString("\$_SERVER['HTTPS'] = 'on';", $captured['index'] ?? '');
        $this->assertStringContainsString('use Illuminate\\Http\\Request;', $captured['index'] ?? '');
        $this->assertSame("*\n!.gitignore\n", $captured['cachePlaceholder'] ?? null);
        $this->assertSame('composer install --no-dev', $captured['railway']['build']['buildCommand'] ?? null);
        $this->assertSame(
            'mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs && php artisan serve --host=0.0.0.0 --port=${PORT}',
            $captured['railway']['deploy']['startCommand'] ?? null
        );
    }

    public function test_readiness_rejects_same_host_http_assets_from_html_or_link_headers(): void
    {
        $url = 'https://vibyra-demo-21-production.up.railway.app/';
        $service = new RailwayRuntimeDeploymentService;
        $readiness = new ReflectionMethod($service, 'publicDemoUrlReady');

        Http::fakeSequence()
            ->push(
                '<script src="http://vibyra-demo-21-production.up.railway.app/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            )
            ->push(
                '<html><body>Demo</body></html>',
                200,
                ['Link' => '<http://vibyra-demo-21-production.up.railway.app/build/assets/app.css>; rel=preload; as=style'],
            )
            ->push(
                '<script src="https://${RAILWAY_PUBLIC_DOMAIN}/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            )
            ->push(
                '<script src="https://vibyra-demo-21-production.up.railway.app/build/assets/app.js"></script>',
                200,
                ['Link' => '<https://vibyra-demo-21-production.up.railway.app/build/assets/app.css>; rel=preload; as=style'],
            );

        $this->assertFalse($readiness->invoke($service, $url));
        $this->assertFalse($readiness->invoke($service, $url));
        $this->assertFalse($readiness->invoke($service, $url));
        $this->assertTrue($readiness->invoke($service, $url));
    }

    private function runtimeDeployment(array $overrides = []): PublishedProjectDeployment
    {
        $user = User::factory()->create();
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'runtime-worker',
            'slug' => 'runtime-worker',
            'title' => 'Runtime Worker',
            'description' => 'Runtime worker test.',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        return PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_QUEUED,
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'build_command' => $overrides['buildCommand'] ?? null,
            'start_command' => $overrides['startCommand'] ?? 'npm run start',
            'metadata' => ['platform' => $overrides['platform'] ?? 'node'],
            'demo_files' => $overrides['files'] ?? [
                [
                    'path' => 'package.json',
                    'encoding' => 'utf8',
                    'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}',
                ],
                [
                    'path' => 'server.js',
                    'encoding' => 'utf8',
                    'body' => "import express from 'express';",
                ],
            ],
        ]);
    }
}
