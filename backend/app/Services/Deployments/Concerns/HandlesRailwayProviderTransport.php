<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

trait HandlesRailwayProviderTransport
{
    private function runRailway(array $arguments, string $cwd, int $timeoutSeconds, ?string $projectToken = null): array
    {
        if (is_callable($this->runner)) {
            return ($this->runner)($arguments, $cwd, $timeoutSeconds);
        }
        $command = [$this->railwayCliPath(), ...$arguments];
        $process = new Process($command, $cwd, $this->railwayEnv($projectToken), null, $timeoutSeconds);
        $process->run();

        return [
            'ok' => $process->isSuccessful(),
            'output' => trim($process->getOutput()."\n".$process->getErrorOutput()),
        ];
    }

    private function uploadSourceArchive(
        PublishedProjectDeployment $deployment,
        string $workdir,
        string $archivePath,
        string $projectToken,
    ): array {
        $archive = new Process(['tar', '-czf', $archivePath, '-C', $workdir, '.'], $workdir, null, null, 120);
        $archive->run();
        if (! $archive->isSuccessful()) {
            return ['ok' => false, 'output' => trim($archive->getErrorOutput())];
        }
        $environmentId = trim((string) data_get($deployment->metadata, 'providerEnvironmentId', ''));
        $url = 'https://backboard.railway.com/project/'.rawurlencode((string) $deployment->provider_project_id)
            .'/environment/'.rawurlencode($environmentId).'/up'
            .'?serviceId='.rawurlencode((string) $deployment->provider_service_id)
            .'&message='.rawurlencode('Vibyra Explore publish '.$deployment->id);
        $archiveBody = (string) File::get($archivePath);
        $response = Http::withHeaders(['project-access-token' => $projectToken])
            ->withBody($archiveBody, 'application/gzip')
            ->timeout(900)
            ->post($url);
        $authenticationRejected = in_array($response->status(), [401, 403], true)
            || Str::contains(Str::lower($response->body()), ['must be logged in', 'unauthorized']);
        if ($authenticationRejected) {
            $accountToken = trim((string) config('services.railway.api_token', ''));
            if ($accountToken !== '') {
                $response = Http::withToken($accountToken)
                    ->withBody($archiveBody, 'application/gzip')
                    ->timeout(900)
                    ->post($url);
            }
        }

        return ['ok' => $response->successful(), 'output' => $response->body()];
    }

    private function waitForRailwayDeployment(string $deploymentId, ?string $projectToken = null): array
    {
        $deadline = time() + max(30, (int) config('services.railway.runtime_ready_timeout', 180));
        do {
            $payload = $this->railwayGraphql(
                'query($id: String!) { deployment(id: $id) { id status } }',
                ['id' => $deploymentId],
                $projectToken,
            );
            if ($payload === null) {
                return [
                    'ok' => false,
                    'output' => $this->lastRailwayError ?: 'Railway deployment status could not be read.',
                ];
            }
            $status = strtoupper((string) data_get($payload, 'deployment.status', ''));
            if ($status === 'SUCCESS') {
                return ['ok' => true, 'output' => json_encode($payload)];
            }
            if (in_array($status, ['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'], true)) {
                return ['ok' => false, 'output' => json_encode($payload)];
            }
            sleep(min(5, max(1, $deadline - time())));
        } while (time() < $deadline);

        return ['ok' => false, 'output' => 'Railway deployment status timed out.'];
    }

    private function railwayServiceUrl(
        string $projectId,
        string $environmentId,
        string $serviceId,
        ?string $projectToken = null,
    ): ?string {
        $payload = $this->railwayGraphql(
            'query($projectId: String!, $environmentId: String!, $serviceId: String!) { domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) { serviceDomains { domain } customDomains { domain } } }',
            compact('projectId', 'environmentId', 'serviceId'),
            $projectToken,
        );
        $url = $this->firstRailwayUrl($payload);
        if ($url) {
            return $url;
        }
        $created = $this->railwayGraphql(
            'mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id domain } }',
            ['input' => compact('environmentId', 'serviceId')],
            $projectToken,
        );

        return $this->firstRailwayUrl($created);
    }

    private function withWorkspace(array $arguments): array
    {
        $workspace = trim((string) config('services.railway.team_id', ''));

        return $workspace === '' ? $arguments : [...$arguments, '--workspace', $workspace];
    }
}
