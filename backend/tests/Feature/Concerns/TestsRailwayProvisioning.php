<?php

namespace Tests\Feature\Concerns;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use ReflectionProperty;

trait TestsRailwayProvisioning
{
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
        $this->assertSame('', $result->latest_logs_summary);
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
        $lastError = new ReflectionProperty($service, 'lastRailwayError');
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
}
