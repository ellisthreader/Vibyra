<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use Tests\TestCase;

class RailwayRuntimeDeploymentServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_uses_account_token_environment_variable_for_railway_cli(): void
    {
        config(['services.railway.api_token' => 'test-account-token']);
        $service = new RailwayRuntimeDeploymentService;
        $method = new ReflectionMethod($service, 'railwayEnv');

        $environment = $method->invoke($service);

        $this->assertSame('test-account-token', $environment['RAILWAY_API_TOKEN']);
        $this->assertFalse($environment['RAILWAY_TOKEN']);

        $projectEnvironment = $method->invoke($service, 'test-project-token');
        $this->assertSame('test-project-token', $projectEnvironment['RAILWAY_TOKEN']);
        $this->assertFalse($projectEnvironment['RAILWAY_API_TOKEN']);
    }

    public function test_service_uses_configured_executable_railway_cli_path(): void
    {
        $path = storage_path('app/test-railway-cli');
        File::put($path, "#!/bin/sh\nexit 0\n");
        chmod($path, 0755);
        config(['services.railway.cli_path' => $path]);

        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'railwayCliPath');

        $this->assertSame($path, $method->invoke(new RailwayRuntimeDeploymentService));
        File::delete($path);
    }

    public function test_service_uses_project_token_for_graphql_status_checks(): void
    {
        Http::fake([
            'https://backboard.railway.com/graphql/v2' => Http::response([
                'data' => ['deployment' => ['id' => 'deployment_123', 'status' => 'SUCCESS']],
            ]),
        ]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'railwayGraphql');

        $payload = $method->invoke(
            new RailwayRuntimeDeploymentService,
            'query($id: String!) { deployment(id: $id) { id status } }',
            ['id' => 'deployment_123'],
            'project-token',
        );

        $this->assertSame('SUCCESS', data_get($payload, 'deployment.status'));
        Http::assertSent(fn ($request): bool => $request->hasHeader('project-access-token', 'project-token')
            && ! $request->hasHeader('Authorization'));
    }

    public function test_service_creates_domain_when_direct_target_has_none(): void
    {
        Http::fakeSequence()
            ->push(['data' => ['domains' => [
                'serviceDomains' => [],
                'customDomains' => [],
            ]]])
            ->push(['data' => ['serviceDomainCreate' => [
                'id' => 'domain_123',
                'domain' => 'runtime-demo.up.railway.app',
            ]]]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'railwayServiceUrl');

        $url = $method->invoke(
            new RailwayRuntimeDeploymentService,
            'project_123',
            'environment_123',
            'service_123',
            'project-token',
        );

        $this->assertSame('https://runtime-demo.up.railway.app', $url);
        Http::assertSentCount(2);
        Http::assertSent(function ($request): bool {
            $body = $request->data();

            return str_contains((string) ($body['query'] ?? ''), 'serviceDomainCreate')
                && data_get($body, 'variables.input.environmentId') === 'environment_123'
                && data_get($body, 'variables.input.serviceId') === 'service_123'
                && $request->hasHeader('project-access-token', 'project-token');
        });
    }

    public function test_direct_uploader_sends_gzip_archive_with_project_token(): void
    {
        Http::fake([
            'https://backboard.railway.com/project/*' => Http::response([
                'deploymentId' => 'deployment_direct',
                'deploymentDomain' => 'direct-demo.up.railway.app',
            ]),
        ]);
        $deployment = $this->runtimeDeployment();
        $deployment->forceFill([
            'provider_project_id' => 'project_direct',
            'provider_service_id' => 'service_direct',
            'metadata' => [
                'platform' => 'node',
                'providerEnvironmentId' => 'environment_direct',
            ],
        ])->save();
        $workdir = storage_path('app/runtime-upload-test');
        $archivePath = $workdir.'.tar.gz';
        File::deleteDirectory($workdir);
        File::delete($archivePath);
        File::ensureDirectoryExists($workdir);
        File::put($workdir.'/server.js', 'console.log("ready");');

        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'uploadSourceArchive');
        $result = $method->invoke(
            new RailwayRuntimeDeploymentService,
            $deployment,
            $workdir,
            $archivePath,
            'project-token',
        );

        $this->assertTrue($result['ok']);
        $this->assertSame('deployment_direct', json_decode($result['output'], true)['deploymentId']);
        Http::assertSent(function ($request): bool {
            return $request->hasHeader('project-access-token', 'project-token')
                && $request->hasHeader('Content-Type', 'application/gzip')
                && str_starts_with($request->body(), "\x1f\x8b");
        });
        File::deleteDirectory($workdir);
        File::delete($archivePath);
    }

    public function test_direct_uploader_retries_auth_rejection_with_account_token(): void
    {
        config(['services.railway.api_token' => 'test-account-token']);
        Http::fakeSequence()
            ->push(['message' => 'You must be logged in to deploy'], 400)
            ->push([
                'deploymentId' => 'deployment_fallback',
                'deploymentDomain' => 'fallback-demo.up.railway.app',
            ]);
        $deployment = $this->runtimeDeployment();
        $deployment->forceFill([
            'provider_project_id' => 'project_fallback',
            'provider_service_id' => 'service_fallback',
            'metadata' => [
                'platform' => 'node',
                'providerEnvironmentId' => 'environment_fallback',
            ],
        ])->save();
        $workdir = storage_path('app/runtime-upload-fallback-test');
        $archivePath = $workdir.'.tar.gz';
        File::deleteDirectory($workdir);
        File::delete($archivePath);
        File::ensureDirectoryExists($workdir);
        File::put($workdir.'/server.js', 'console.log("ready");');

        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'uploadSourceArchive');
        $result = $method->invoke(
            new RailwayRuntimeDeploymentService,
            $deployment,
            $workdir,
            $archivePath,
            'project-token',
        );

        $this->assertTrue($result['ok']);
        $this->assertSame('deployment_fallback', json_decode($result['output'], true)['deploymentId']);
        Http::assertSentCount(2);
        Http::assertSent(function ($request): bool {
            return $request->hasHeader('Authorization', 'Bearer test-account-token')
                && $request->hasHeader('Content-Type', 'application/gzip');
        });
        File::deleteDirectory($workdir);
        File::delete($archivePath);
    }

    public function test_isolated_runtime_project_is_created_in_configured_workspace(): void
    {
        config([
            'services.railway.api_token' => 'test-account-token',
            'services.railway.team_id' => 'workspace_123',
        ]);
        Http::fake(function ($request) {
            $body = $request->data();
            $query = (string) ($body['query'] ?? '');
            if (str_contains($query, 'projectCreate')) {
                $this->assertSame('workspace_123', data_get($body, 'variables.input.workspaceId'));
                $this->assertNull(data_get($body, 'variables.input.teamId'));

                return Http::response(['data' => ['projectCreate' => [
                    'id' => 'project_123',
                    'environments' => ['edges' => [['node' => ['id' => 'environment_123', 'name' => 'production']]]],
                ]]]);
            }
            if (str_contains($query, 'serviceCreate')) {
                return Http::response(['data' => ['serviceCreate' => ['id' => 'service_123', 'name' => 'Runtime']]]);
            }

            return Http::response(['data' => []]);
        });
        $deployment = $this->runtimeDeployment();
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'ensureIsolatedTarget');

        $target = $method->invoke(new RailwayRuntimeDeploymentService, $deployment);

        $this->assertSame('project_123', $target['projectId']);
        $this->assertSame('service_123', $target['serviceId']);
        $this->assertSame('environment_123', $target['environmentId']);
    }

    public function test_service_preserves_railway_project_provisioning_error(): void
    {
        config([
            'services.railway.api_token' => 'test-account-token',
            'services.railway.runtime_upload_mode' => 'direct',
            'services.railway.team_id' => 'workspace_123',
        ]);
        Http::fake(Http::response([
            'errors' => [[
                'message' => 'You do not have permission to create a project in this workspace.',
            ]],
        ]));

        $result = (new RailwayRuntimeDeploymentService)->deploy($this->runtimeDeployment());

        $this->assertSame(PublishedProjectDeployment::STATUS_FAILED, $result->status);
        $this->assertSame(
            'Railway isolated demo target could not be provisioned. Railway said: You do not have permission to create a project in this workspace.',
            $result->last_error,
        );
        $this->assertSame(
            '',
            $result->latest_logs_summary,
        );
    }

    public function test_incomplete_laravel_bundle_fails_before_railway_is_contacted(): void
    {
        config([
            'services.railway.api_token' => 'test-account-token',
            'services.railway.runtime_upload_mode' => 'direct',
        ]);
        Http::fake();
        $deployment = $this->runtimeDeployment([
            'platform' => 'laravel',
            'startCommand' => 'php artisan serve --host=0.0.0.0 --port=${PORT}',
            'files' => [[
                'path' => 'composer.json',
                'encoding' => 'utf8',
                'body' => '{"require":{"laravel/framework":"^12.0"}}',
            ]],
        ]);

        $result = (new RailwayRuntimeDeploymentService)->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_FAILED, $result->status);
        $this->assertSame(
            'Runtime bundle is incomplete for Laravel: missing artisan and public/index.php.',
            $result->last_error,
        );
        Http::assertNothingSent();
    }

    public function test_oversized_runtime_bundle_fails_before_railway_is_contacted(): void
    {
        config(['services.railway.runtime_upload_mode' => 'direct']);
        Http::fake();
        $deployment = $this->runtimeDeployment([
            'files' => [
                [
                    'path' => 'package.json',
                    'encoding' => 'utf8',
                    'body' => '{"scripts":{"start":"node server.js"}}',
                ],
                [
                    'path' => 'server.js',
                    'encoding' => 'utf8',
                    'body' => str_repeat('x', 10_000_001),
                ],
            ],
        ]);

        $result = (new RailwayRuntimeDeploymentService)->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_FAILED, $result->status);
        $this->assertSame(
            'Runtime bundle is too large to host: extracted files exceed 10 MB.',
            $result->last_error,
        );
        Http::assertNothingSent();
    }

    public function test_graphql_http_failure_preserves_railway_error_message(): void
    {
        config(['services.railway.api_token' => 'test-account-token']);
        Http::fake([
            'https://backboard.railway.com/graphql/v2' => Http::response([
                'message' => 'Project not found',
            ], 404),
        ]);
        $service = new RailwayRuntimeDeploymentService;
        $graphql = new ReflectionMethod($service, 'railwayGraphql');
        $lastError = new \ReflectionProperty($service, 'lastRailwayError');

        $payload = $graphql->invoke($service, 'query { me { id } }', []);

        $this->assertNull($payload);
        $this->assertSame('Project not found', $lastError->getValue($service));
    }

    public function test_deployment_polling_stops_on_graphql_provider_error(): void
    {
        config(['services.railway.api_token' => 'test-account-token']);
        Http::fake([
            'https://backboard.railway.com/graphql/v2' => Http::response([
                'errors' => [['message' => 'Deployment does not exist']],
            ]),
        ]);
        $service = new RailwayRuntimeDeploymentService;
        $method = new ReflectionMethod($service, 'waitForRailwayDeployment');

        $result = $method->invoke($service, 'missing_deployment');

        $this->assertFalse($result['ok']);
        $this->assertSame('Deployment does not exist', $result['output']);
        Http::assertSentCount(1);
    }

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
            if ($arguments[0] === 'list') {
                return ['ok' => true, 'output' => json_encode([
                    [
                        'workspace' => ['id' => 'team_123'],
                        'id' => 'project_123',
                        'name' => 'vibyra-demo-1',
                        'services' => ['edges' => [['node' => ['id' => 'service_123', 'name' => 'Runtime Demo']]]],
                    ],
                ])];
            }
            if ($arguments[0] === 'service' && ($arguments[1] ?? '') === 'status') {
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
        $statusCall = collect($calls)->first(fn ($call) => ($call[0][0] ?? '') === 'service' && ($call[0][1] ?? '') === 'status');
        $this->assertNotContains('--workspace', $statusCall[0] ?? []);
        $this->assertContains('project_123', $statusCall[0] ?? []);
        $this->assertContains('service_123', $statusCall[0] ?? []);
        $domainCall = collect($calls)->first(fn ($call) => ($call[0][0] ?? '') === 'domain');
        $this->assertContains('--environment', $domainCall[0] ?? []);
        $this->assertContains('production', $domainCall[0] ?? []);
    }

    public function test_service_reuses_existing_railway_target_on_retry(): void
    {
        config(['services.railway.team_id' => 'workspace_123']);
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
            if ($arguments[0] === 'service' && ($arguments[1] ?? '') === 'status') {
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
        $this->assertNotContains('--workspace', $calls[0]);
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
            if ($arguments[0] === 'service' && ($arguments[1] ?? '') === 'status') {
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
            if ($arguments[0] === 'up') {
                return ['ok' => true, 'output' => '{}'];
            }
            if ($arguments[0] === 'list') {
                return ['ok' => true, 'output' => json_encode([[
                    'id' => 'project_123',
                    'name' => 'vibyra-demo-1',
                    'services' => ['edges' => [['node' => ['id' => 'service_123', 'name' => 'Runtime Demo']]]],
                ]])];
            }
            if ($arguments[0] === 'service' && ($arguments[1] ?? '') === 'status') {
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
                [
                    'path' => 'railway.json',
                    'encoding' => 'utf8',
                    'body' => '{"deploy":{"startCommand":"echo unsafe"}}',
                ],
                [
                    'path' => '.env',
                    'encoding' => 'utf8',
                    'body' => "APP_DEBUG=true\nAPP_URL=http://localhost\n",
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
            if ($arguments[0] === 'list') {
                return ['ok' => true, 'output' => json_encode([[
                    'id' => 'project_123',
                    'name' => 'vibyra-demo-1',
                    'services' => ['edges' => [['node' => ['id' => 'service_123', 'name' => 'Runtime Demo']]]],
                ]])];
            }
            if ($arguments[0] === 'service' && ($arguments[1] ?? '') === 'status') {
                return ['ok' => true, 'output' => '{"deploymentId":"deployment_123"}'];
            }
            if ($arguments[0] === 'domain') {
                return ['ok' => true, 'output' => '{"domain":"laravel-demo.up.railway.app"}'];
            }

            return ['ok' => false, 'output' => 'unexpected'];
        });

        $result = $service->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $result->status);
        $this->assertStringContainsString('APP_KEY=base64:', $captured['env'] ?? '');
        $this->assertStringContainsString('APP_DEBUG=false', $captured['env'] ?? '');
        $this->assertStringContainsString('DB_CONNECTION=sqlite', $captured['env'] ?? '');
        $this->assertStringNotContainsString('APP_DEBUG=true', $captured['env'] ?? '');
        $this->assertStringNotContainsString('APP_URL=', $captured['env'] ?? '');
        $this->assertStringNotContainsString('ASSET_URL=', $captured['env'] ?? '');
        $this->assertStringContainsString('HTTP_X_FORWARDED_PROTO', $captured['index'] ?? '');
        $this->assertStringContainsString("\$_SERVER['HTTPS'] = 'on';", $captured['index'] ?? '');
        $this->assertStringContainsString('use Illuminate\\Http\\Request;', $captured['index'] ?? '');
        $this->assertSame("*\n!.gitignore\n", $captured['cachePlaceholder'] ?? null);
        $this->assertSame('composer install --no-dev', $captured['railway']['build']['buildCommand'] ?? null);
        $this->assertSame(
            'mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}',
            $captured['railway']['deploy']['startCommand'] ?? null
        );
    }

    public function test_readiness_rejects_html_when_a_same_host_frontend_asset_is_missing(): void
    {
        $url = 'https://runtime-demo.up.railway.app/';
        Http::fake([
            $url => Http::response(
                '<!doctype html><script src="/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            ),
            'https://runtime-demo.up.railway.app/build/assets/app.js' => Http::response('Not Found', 404),
        ]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'publicDemoUrlReady');

        $this->assertFalse($method->invoke(new RailwayRuntimeDeploymentService, $url));
    }

    public function test_readiness_accepts_working_backend_html_and_frontend_assets(): void
    {
        $url = 'https://runtime-demo.up.railway.app/';
        Http::fake([
            $url => Http::response(
                '<!doctype html><link rel="stylesheet" href="/build/assets/app.css"><script src="/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            ),
            'https://runtime-demo.up.railway.app/build/assets/app.css' => Http::response(
                'body { color: black; }',
                200,
                ['Content-Type' => 'text/css'],
            ),
            'https://runtime-demo.up.railway.app/build/assets/app.js' => Http::response(
                'console.log("ready");',
                200,
                ['Content-Type' => 'application/javascript'],
            ),
        ]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'publicDemoUrlReady');

        $this->assertTrue($method->invoke(new RailwayRuntimeDeploymentService, $url));
        Http::assertSentCount(3);
    }

    public function test_readiness_requires_html_when_bundle_contains_a_frontend(): void
    {
        $url = 'https://runtime-demo.up.railway.app/';
        Http::fake([
            $url => Http::response(
                '{"status":"ok"}',
                200,
                ['Content-Type' => 'application/json'],
            ),
        ]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'publicDemoUrlReady');

        $this->assertFalse($method->invoke(new RailwayRuntimeDeploymentService, $url, true));
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
            )
            ->push('console.log("ready");', 200, ['Content-Type' => 'application/javascript'])
            ->push('body {}', 200, ['Content-Type' => 'text/css']);

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
