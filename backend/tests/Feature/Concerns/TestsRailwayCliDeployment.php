<?php

namespace Tests\Feature\Concerns;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\RailwayRuntimeDeploymentService;

trait TestsRailwayCliDeployment
{
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
                return ['ok' => true, 'output' => json_encode([[
                    'workspace' => ['id' => 'team_123'],
                    'id' => 'project_123',
                    'name' => 'vibyra-demo-1',
                    'services' => ['edges' => [['node' => ['id' => 'service_123', 'name' => 'Runtime Demo']]]],
                ]])];
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
}
