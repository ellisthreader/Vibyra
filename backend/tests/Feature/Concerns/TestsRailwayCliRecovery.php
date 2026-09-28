<?php

namespace Tests\Feature\Concerns;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\RailwayRuntimeDeploymentService;

trait TestsRailwayCliRecovery
{
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
}
