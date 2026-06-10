<?php

namespace App\Console\Commands;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Console\Command;

class DeployRuntimeDemos extends Command
{
    protected $signature = 'vibyra:deploy-runtime-demos {--limit=1 : Maximum queued runtime demos to deploy}';

    protected $description = 'Deploy queued Vibyra runtime demo bundles to Railway.';

    public function handle(RailwayRuntimeDeploymentService $railway): int
    {
        $limit = max(1, min(5, (int) $this->option('limit')));
        $deployments = PublishedProjectDeployment::query()
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->where('status', PublishedProjectDeployment::STATUS_QUEUED)
            ->whereHas('project', fn ($project) => $project
                ->where('visibility', 'public')
                ->where('review_status', PublishedProject::REVIEW_APPROVED))
            ->oldest()
            ->limit($limit)
            ->get();

        if ($deployments->isEmpty()) {
            $this->info('No queued runtime demos.');

            return self::SUCCESS;
        }

        foreach ($deployments as $deployment) {
            $this->info("Deploying runtime demo {$deployment->id}...");
            $result = $railway->deploy($deployment);
            $this->line("Runtime demo {$deployment->id}: {$result->status}".($result->public_url ? " {$result->public_url}" : ''));
        }

        return self::SUCCESS;
    }
}
