<?php

namespace App\Services\Deployments;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\PublishedProjectRuntimeCleanup;

class RuntimeDemoLifecycleService
{
    public function supersedePending(PublishedProject $project): void
    {
        $project->deployments()
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->whereIn('status', [
                PublishedProjectDeployment::STATUS_PENDING_REVIEW,
                PublishedProjectDeployment::STATUS_QUEUED,
            ])
            ->update([
                'status' => PublishedProjectDeployment::STATUS_STOPPED,
                'provider_status' => 'superseded',
                'public_url' => null,
                'last_error' => 'Superseded by a newer publish.',
                'updated_at' => now(),
            ]);
    }

    public function retireProject(PublishedProject $project, string $reason): void
    {
        $deployments = $project->deployments()
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->whereNotIn('status', [PublishedProjectDeployment::STATUS_STOPPED])
            ->get();

        foreach ($deployments as $deployment) {
            $this->retire($deployment, $reason);
        }
    }

    public function retireReplacedAfterLive(PublishedProjectDeployment $current): void
    {
        $replaced = PublishedProjectDeployment::query()
            ->where('published_project_id', $current->published_project_id)
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->where('id', '!=', $current->id)
            ->whereIn('status', PublishedProjectDeployment::SUCCESS_STATUSES)
            ->get();

        foreach ($replaced as $deployment) {
            $this->retire($deployment, 'replaced');
        }

        $this->enforceUserLimit($current);
    }

    public function enforceUserLimit(PublishedProjectDeployment $current): void
    {
        $limit = max(0, (int) config('services.railway.max_active_demos_per_user', 1));
        $active = PublishedProjectDeployment::query()
            ->where('user_id', $current->user_id)
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->whereIn('status', PublishedProjectDeployment::SUCCESS_STATUSES)
            ->latest('hosted_at')
            ->get();

        foreach ($active->slice($limit) as $deployment) {
            $this->retire($deployment, 'user_limit');
        }
    }

    public function retire(PublishedProjectDeployment $deployment, string $reason): void
    {
        if ($deployment->provider_project_id) {
            PublishedProjectRuntimeCleanup::updateOrCreate(
                [
                    'provider' => $deployment->provider,
                    'provider_project_id' => $deployment->provider_project_id,
                ],
                [
                    'user_id' => $deployment->user_id,
                    'provider_service_id' => $deployment->provider_service_id,
                    'status' => 'pending',
                    'reason' => $reason,
                    'last_error' => null,
                    'next_attempt_at' => now(),
                    'completed_at' => null,
                ],
            );
        }

        $deployment->forceFill([
            'status' => PublishedProjectDeployment::STATUS_STOPPED,
            'provider_status' => 'retirement_pending',
            'public_url' => null,
            'last_error' => 'Runtime retired: '.$reason.'.',
        ])->save();
    }
}
