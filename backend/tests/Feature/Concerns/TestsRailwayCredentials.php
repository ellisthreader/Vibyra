<?php

namespace Tests\Feature\Concerns;

use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;

trait TestsRailwayCredentials
{
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
}
