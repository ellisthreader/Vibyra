<?php

namespace App\Jobs;

use App\Contracts\RuntimeDeploymentProvider;
use App\Models\PublishedProjectDeployment;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class DeployRuntimeDemoJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 1200;

    public int $uniqueFor = 1800;

    public function __construct(public int $deploymentId)
    {
        $this->onQueue((string) config('runtime_deployments.queue', 'deployments'));
    }

    public function uniqueId(): string
    {
        return (string) $this->deploymentId;
    }

    public function handle(RuntimeDeploymentProvider $provider): void
    {
        $deployment = PublishedProjectDeployment::find($this->deploymentId);
        if (! $deployment || $deployment->status !== PublishedProjectDeployment::STATUS_QUEUED) {
            return;
        }

        $provider->deploy($deployment);
    }

    public function failed(?Throwable $error): void
    {
        PublishedProjectDeployment::query()
            ->whereKey($this->deploymentId)
            ->whereIn('status', [
                PublishedProjectDeployment::STATUS_QUEUED,
                PublishedProjectDeployment::STATUS_UPLOADING,
                PublishedProjectDeployment::STATUS_BUILDING,
                PublishedProjectDeployment::STATUS_STARTING,
            ])
            ->update([
                'status' => PublishedProjectDeployment::STATUS_FAILED,
                'provider_status' => 'queue_failed',
                'last_error' => str($error?->getMessage() ?: 'Runtime deployment worker failed.')
                    ->limit(900, '')
                    ->toString(),
                'updated_at' => now(),
            ]);
    }
}
