<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\RuntimeDemoLifecycleService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

trait HandlesRailwayDeploymentWorkflow
{
    public function deploy(PublishedProjectDeployment $deployment): PublishedProjectDeployment
    {
        if ($deployment->provider !== PublishedProjectDeployment::PROVIDER_RAILWAY || $deployment->status !== PublishedProjectDeployment::STATUS_QUEUED) {
            return $deployment;
        }
        $claimed = PublishedProjectDeployment::query()
            ->whereKey($deployment->id)
            ->where('status', PublishedProjectDeployment::STATUS_QUEUED)
            ->update([
                'status' => PublishedProjectDeployment::STATUS_UPLOADING,
                'provider_status' => 'uploading_source',
                'last_error' => null,
                'updated_at' => now(),
            ]);
        if ($claimed !== 1) {
            return $deployment->fresh();
        }
        $deployment = $deployment->fresh();
        if ((int) config('services.railway.max_active_demos_per_user', 1) <= 0) {
            return $this->markStopped($deployment, 'Runtime demos are disabled for this account.');
        }
        $bundleError = $this->validateSourceBundle($deployment);
        if ($bundleError !== null) {
            return $this->markFailed($deployment, $bundleError, $bundleError);
        }
        $workdir = storage_path('app/runtime-deployments/'.$deployment->id.'-'.Str::random(8));
        $archivePath = $workdir.'.tar.gz';
        $projectToken = null;
        $projectTokenName = null;
        $useCliUpload = is_callable($this->runner)
            || strtolower((string) config('services.railway.runtime_upload_mode', 'direct')) === 'cli';

        try {
            $this->writeSourceBundle($deployment, $workdir);
            $this->writeRailwayConfig($deployment, $workdir);
            if (! is_callable($this->runner)) {
                $target = $this->ensureIsolatedTarget($deployment);
                if (! $target) {
                    $detail = $this->lastRailwayError !== '' ? ' Railway said: '.$this->lastRailwayError : '';

                    return $this->markFailed(
                        $deployment,
                        'Railway isolated demo target could not be provisioned.'.$detail,
                        $this->lastRailwayError,
                    );
                }
                $deployment = $deployment->fresh();
                $projectTokenName = 'vibyra-runtime-'.$deployment->id.'-'.Str::lower(Str::random(8));
                $projectToken = $this->createProjectToken(
                    (string) $target['projectId'],
                    (string) $target['environmentId'],
                    $projectTokenName
                );
                if (! $projectToken) {
                    return $this->markFailed(
                        $deployment,
                        $this->withRailwayError('Railway project deployment token could not be created.'),
                        $this->lastRailwayError,
                    );
                }
            }
            $projectName = $this->projectName($deployment);
            $upload = $useCliUpload
                ? $this->runRailway($this->uploadArguments($deployment), $workdir, 900, $projectToken)
                : $this->uploadSourceArchive($deployment, $workdir, $archivePath, (string) $projectToken);
            if (! $upload['ok']) {
                return $this->markFailed(
                    $deployment,
                    $this->withProviderOutput('Railway upload failed.', $upload['output']),
                    $upload['output'],
                );
            }
            $uploadPayload = $this->decodeJsonPayload($upload['output']);
            $uploadedDeploymentId = $this->firstDeploymentId($uploadPayload);
            $deployment->forceFill([
                'status' => PublishedProjectDeployment::STATUS_BUILDING,
                'provider_status' => 'uploaded',
                'provider_deployment_id' => $uploadedDeploymentId,
                'latest_logs_summary' => Str::limit($upload['output'], 1800, ''),
            ])->save();
            $projectId = $deployment->provider_project_id;
            $serviceId = $deployment->provider_service_id;
            $serviceName = null;
            if (! $projectId || ! $serviceId) {
                $listed = $this->findListedProjectTarget($projectName);
                $projectId = $projectId ?: ($listed['projectId'] ?? null);
                $serviceId = $serviceId ?: ($listed['serviceId'] ?? null);
                $serviceName = $listed['serviceName'] ?? null;
            }
            if (! $projectId || ! ($serviceId || $serviceName)) {
                return $this->markFailed($deployment, 'Railway created the upload but its isolated demo target could not be resolved.', $upload['output']);
            }
            if ($useCliUpload) {
                $status = $this->runRailway($this->statusArguments($projectId, $serviceId ?: $serviceName), $workdir, 120, $projectToken);
                if (! $status['ok']) {
                    return $this->markFailed($deployment, 'Railway status lookup failed.', $status['output']);
                }
                $statusPayload = $this->decodeJsonPayload($status['output']);
                $domain = $this->runRailway([
                    'domain', '--json', '--environment', $this->environmentName(),
                    '--project', $projectId, '--service', $serviceId ?: $serviceName,
                ], $workdir, 120, $projectToken);
                $url = $domain['ok']
                    ? ($this->firstRailwayUrl($this->decodeJsonPayload($domain['output'])) ?: $this->firstRailwayUrl($domain['output']))
                    : null;
            } else {
                if (! $uploadedDeploymentId) {
                    return $this->markFailed($deployment, 'Railway upload did not return a deployment ID.', $upload['output']);
                }
                $status = $this->waitForRailwayDeployment($uploadedDeploymentId, $projectToken);
                if (! $status['ok']) {
                    return $this->markFailed(
                        $deployment,
                        $this->withProviderOutput('Railway deployment failed before becoming active.', $status['output']),
                        $status['output'],
                    );
                }
                $statusPayload = $this->decodeJsonPayload($status['output']);
                $url = $this->firstRailwayUrl($uploadPayload)
                    ?: $this->railwayServiceUrl(
                        (string) $projectId,
                        (string) data_get($deployment->metadata, 'providerEnvironmentId', ''),
                        (string) $serviceId,
                        $projectToken,
                    );
            }
            if (! $this->isSafePublicUrl($url)) {
                return $this->markFailed(
                    $deployment,
                    $this->withRailwayError('Railway did not return a public HTTPS demo URL.'),
                    $this->lastRailwayError ?: $status['output'],
                );
            }
            $deployment->forceFill([
                'provider_project_id' => $projectId,
                'provider_service_id' => $serviceId ?: $serviceName,
                'provider_deployment_id' => $uploadedDeploymentId ?: $this->firstDeploymentId($statusPayload),
                'status' => PublishedProjectDeployment::STATUS_STARTING,
                'provider_status' => 'starting',
                'public_url' => $url,
                'latest_logs_summary' => Str::limit($status['output'], 1800, ''),
            ])->save();
            if (! $this->waitForPublicDemoUrl($url, $deployment)) {
                return $this->markFailed($deployment, 'Railway demo URL did not become reachable.', $status['output']);
            }
            $deployment->forceFill([
                'provider_project_id' => $projectId,
                'provider_service_id' => $serviceId ?: $serviceName,
                'provider_deployment_id' => $uploadedDeploymentId ?: $this->firstDeploymentId($statusPayload),
                'status' => PublishedProjectDeployment::STATUS_LIVE,
                'provider_status' => 'live',
                'public_url' => $url,
                'latest_logs_summary' => Str::limit($status['output'], 1800, ''),
                'hosted_at' => now(),
            ])->save();
            app(RuntimeDemoLifecycleService::class)->retireReplacedAfterLive($deployment);
        } catch (Throwable $error) {
            return $this->markFailed($deployment, $error->getMessage(), '');
        } finally {
            if ($projectTokenName && $deployment->provider_project_id) {
                $this->deleteProjectToken((string) $deployment->provider_project_id, $projectTokenName);
            }
            File::deleteDirectory($workdir);
            File::delete($archivePath);
        }

        return $deployment;
    }
}
