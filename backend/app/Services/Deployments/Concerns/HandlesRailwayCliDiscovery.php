<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;

trait HandlesRailwayCliDiscovery
{
    private function uploadArguments(PublishedProjectDeployment $deployment): array
    {
        if ($deployment->provider_project_id && $deployment->provider_service_id) {
            return [
                'up',
                '--project',
                $deployment->provider_project_id,
                '--service',
                $deployment->provider_service_id,
                '--environment',
                $this->environmentName(),
                '--detach',
                '--json',
                '--yes',
            ];
        }

        return $this->withWorkspace([
            'up',
            '--new',
            '--name',
            $this->projectName($deployment),
            '--environment',
            $this->environmentName(),
            '--detach',
            '--json',
            '--yes',
        ]);
    }

    private function statusArguments(string $projectId, string $service): array
    {
        return [
            'service',
            'status',
            '--project',
            $projectId,
            '--service',
            $service,
            '--environment',
            $this->environmentName(),
            '--json',
        ];
    }

    private function environmentName(): string
    {
        return trim((string) config('services.railway.runtime_environment', 'production')) ?: 'production';
    }

    private function findListedProjectTarget(string $projectName): ?array
    {
        $list = $this->runRailway(['list', '--json'], base_path(), 120);
        if (! $list['ok']) {
            return null;
        }
        $payload = $this->decodeJsonPayload($list['output']);
        $projects = $this->projectList($payload);
        $workspace = trim((string) config('services.railway.team_id', ''));
        $matches = [];
        foreach ($projects as $project) {
            if (! is_array($project) || (string) ($project['name'] ?? '') !== $projectName) {
                continue;
            }
            if ($workspace !== '' && (string) data_get($project, 'workspace.id') !== $workspace) {
                continue;
            }
            $matches[] = $project;
        }
        usort($matches, fn ($a, $b) => strcmp((string) ($b['createdAt'] ?? ''), (string) ($a['createdAt'] ?? '')));
        $project = $matches[0] ?? null;
        if (! is_array($project)) {
            return null;
        }

        return [
            'projectId' => $this->firstString($project, ['id'], fn ($path) => $path === 'id'),
            'serviceId' => $this->firstServiceId($project),
            'serviceName' => $this->firstServiceName($project),
        ];
    }

    private function projectList(mixed $payload): array
    {
        if (! is_array($payload)) {
            return [];
        }
        if (array_is_list($payload)) {
            return $payload;
        }
        $projects = $payload['projects'] ?? [];

        return is_array($projects) ? $projects : [];
    }

    private function railwayEnv(?string $projectToken = null): array
    {
        if ($projectToken) {
            return [
                'RAILWAY_TOKEN' => $projectToken,
                'RAILWAY_API_TOKEN' => false,
            ];
        }
        $env = ['RAILWAY_TOKEN' => false];
        $token = (string) config('services.railway.api_token', '');
        if ($token !== '') {
            $env['RAILWAY_API_TOKEN'] = $token;
        }

        return $env;
    }

    private function railwayCliPath(): string
    {
        $configured = trim((string) config('services.railway.cli_path', 'railway')) ?: 'railway';
        if ($configured !== 'railway' && is_executable($configured)) {
            return $configured;
        }
        $nixCandidates = glob('/nix/store/*-nodejs-*/lib/node_modules/@railway/cli/bin/railway') ?: [];
        rsort($nixCandidates);
        foreach ($nixCandidates as $candidate) {
            if (is_executable($candidate)) {
                return $candidate;
            }
        }

        return $configured;
    }
}
