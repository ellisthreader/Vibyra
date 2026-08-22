<?php

namespace App\Console\Commands;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\DeploymentArtifactStore;
use Illuminate\Console\Command;

class BackfillDeploymentArtifacts extends Command
{
    protected $signature = 'vibyra:backfill-deployment-artifacts
        {--limit=100 : Maximum deployments to copy per run}
        {--after=0 : Only process deployment IDs above this value}';

    protected $description = 'Copy inline deployment artifacts to the configured object-storage disk';

    public function handle(DeploymentArtifactStore $artifacts): int
    {
        if (config('deployment_artifacts.mode') !== 'dual') {
            $this->error('Set VIBYRA_DEPLOYMENT_ARTIFACT_MODE=dual before backfilling.');

            return self::FAILURE;
        }

        $limit = max(1, min(1000, (int) $this->option('limit')));
        $deployments = PublishedProjectDeployment::query()
            ->whereNull('artifact_path')
            ->where('id', '>', max(0, (int) $this->option('after')))
            ->where(fn ($query) => $query->whereNotNull('demo_html')->orWhereNotNull('demo_files'))
            ->oldest('id')
            ->limit($limit)
            ->get();
        $failed = 0;

        foreach ($deployments as $deployment) {
            if (! $artifacts->persist($deployment)) {
                $failed++;
            }
        }

        $this->info('Copied '.($deployments->count() - $failed)." deployment artifacts; {$failed} failed.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
