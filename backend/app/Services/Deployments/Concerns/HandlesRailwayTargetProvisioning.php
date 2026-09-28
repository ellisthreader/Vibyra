<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;
use Throwable;

trait HandlesRailwayTargetProvisioning
{
    private function ensureIsolatedTarget(PublishedProjectDeployment $deployment): ?array
    {
        $projectId = (string) ($deployment->provider_project_id ?? '');
        $serviceId = (string) ($deployment->provider_service_id ?? '');
        $environmentId = (string) data_get($deployment->metadata, 'providerEnvironmentId', '');
        if ($projectId !== '') {
            $project = $this->railwayGraphql(
                'query($id: String!) { project(id: $id) { id environments { edges { node { id name } } } services { edges { node { id name } } } } }',
                ['id' => $projectId]
            );
            $environmentId = $environmentId ?: $this->namedEdgeId(
                data_get($project, 'project.environments.edges', []),
                $this->environmentName()
            );
            $serviceId = $serviceId ?: $this->firstEdgeId(data_get($project, 'project.services.edges', []));
        } else {
            $projectInput = [
                'name' => $this->projectName($deployment),
                'description' => 'Isolated Vibyra Explore runtime demo',
                'defaultEnvironmentName' => $this->environmentName(),
            ];
            $workspaceId = trim((string) config('services.railway.team_id', ''));
            if ($workspaceId !== '') {
                $projectInput['workspaceId'] = $workspaceId;
            }
            $project = $this->railwayGraphql(
                'mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { id environments { edges { node { id name } } } } }',
                ['input' => $projectInput]
            );
            $projectId = (string) data_get($project, 'projectCreate.id', '');
            $environmentId = $this->namedEdgeId(
                data_get($project, 'projectCreate.environments.edges', []),
                $this->environmentName()
            );
        }
        if ($projectId === '' || $environmentId === '') {
            return null;
        }
        if ($serviceId === '') {
            $service = $this->railwayGraphql(
                'mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
                ['input' => [
                    'projectId' => $projectId,
                    'name' => $this->projectName($deployment),
                ]]
            );
            $serviceId = (string) data_get($service, 'serviceCreate.id', '');
        }
        if ($serviceId === '') {
            return null;
        }
        $metadata = is_array($deployment->metadata) ? $deployment->metadata : [];
        $deployment->forceFill([
            'provider_project_id' => $projectId,
            'provider_service_id' => $serviceId,
            'metadata' => [...$metadata, 'providerEnvironmentId' => $environmentId],
        ])->save();

        return compact('projectId', 'serviceId', 'environmentId');
    }

    private function createProjectToken(string $projectId, string $environmentId, string $name): ?string
    {
        $payload = $this->railwayGraphql(
            'mutation($input: ProjectTokenCreateInput!) { projectTokenCreate(input: $input) }',
            ['input' => compact('projectId', 'environmentId', 'name')]
        );
        $token = trim((string) data_get($payload, 'projectTokenCreate', ''));

        return $token !== '' ? $token : null;
    }

    private function deleteProjectToken(string $projectId, string $name): void
    {
        try {
            $payload = $this->railwayGraphql(
                'query($projectId: String!) { projectTokens(projectId: $projectId, first: 100) { edges { node { id name } } } }',
                compact('projectId')
            );
            foreach ((array) data_get($payload, 'projectTokens.edges', []) as $edge) {
                if ((string) data_get($edge, 'node.name', '') !== $name) {
                    continue;
                }
                $id = (string) data_get($edge, 'node.id', '');
                if ($id !== '') {
                    $this->railwayGraphql(
                        'mutation($id: String!) { projectTokenDelete(id: $id) }',
                        compact('id')
                    );
                }
            }
        } catch (Throwable) {
            // Token cleanup must not overwrite the deployment result.
        }
    }

    private function namedEdgeId(mixed $edges, string $name): string
    {
        foreach ((array) $edges as $edge) {
            if ((string) data_get($edge, 'node.name', '') === $name) {
                return (string) data_get($edge, 'node.id', '');
            }
        }

        return '';
    }

    private function firstEdgeId(mixed $edges): string
    {
        return (string) data_get((array) $edges, '0.node.id', '');
    }
}
