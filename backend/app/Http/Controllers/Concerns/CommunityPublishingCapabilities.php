<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use App\Services\Deployments\DeploymentArtifactStore;

trait CommunityPublishingCapabilities
{
    private function publishedAppCapabilities(PublishedProject $project): array
    {
        $deployments = $project->relationLoaded('deployments')
            ? $project->deployments
            : $project->deployments()->latest('id')->limit(20)->get();
        $staticReady = $deployments->contains(fn (PublishedProjectDeployment $deployment) => (
            $deployment->provider === PublishedProjectDeployment::PROVIDER_STATIC
            && $deployment->isSuccessful()
            && $this->isOpenablePublishedDeployment($deployment)
        ));
        $runtime = $deployments
            ->where('provider', PublishedProjectDeployment::PROVIDER_RAILWAY)
            ->sortByDesc('id')
            ->first();
        $runtimeIncludesFrontend = $runtime && (
            filled(data_get($runtime->metadata, 'frontendDistDirectory'))
            || (bool) data_get($runtime->metadata, 'frontendIncluded', false)
        );
        $runtimeFrontendStatus = $runtimeIncludesFrontend
            ? $this->hostedDemoClientStatus((string) $runtime->status)
            : 'unavailable';

        return [
            'frontendStatus' => ($this->hasPreviewHtml($project) || $staticReady) ? 'ready' : $runtimeFrontendStatus,
            'backendStatus' => $runtime ? $this->hostedDemoClientStatus((string) $runtime->status) : 'not_included',
            'backendPlatform' => $runtime ? ($runtime->metadata['platform'] ?? null) : null,
        ];
    }

    private function latestSuccessfulHostedDemo(PublishedProject $project): ?PublishedProjectDeployment
    {
        if ($project->relationLoaded('latestSuccessfulDeployment')) {
            return $project->latestSuccessfulDeployment;
        }

        return $project->latestSuccessfulDeployment()->first();
    }

    private function latestDeployment(PublishedProject $project): ?PublishedProjectDeployment
    {
        if ($project->relationLoaded('latestDeployment')) {
            return $project->latestDeployment;
        }

        return $project->latestDeployment()->first();
    }

    private function openableSuccessfulHostedDemo(PublishedProject $project): ?PublishedProjectDeployment
    {
        $deployments = $project->relationLoaded('deployments')
            ? $project->deployments
                ->whereIn('status', PublishedProjectDeployment::SUCCESS_STATUSES)
                ->sortByDesc(fn (PublishedProjectDeployment $deployment) => ((optional($deployment->hosted_at)->timestamp ?? 0) * 1_000_000) + (int) $deployment->id)
            : $project->deployments()
                ->whereIn('status', PublishedProjectDeployment::SUCCESS_STATUSES)
                ->latest('hosted_at')
                ->latest('id')
                ->limit(20)
                ->get();

        foreach ($deployments as $deployment) {
            if (! $deployment instanceof PublishedProjectDeployment || ! $deployment->isSuccessful()) {
                continue;
            }
            if ($this->isOpenablePublishedDeployment($deployment)) {
                return $deployment;
            }
        }

        return null;
    }

    private function isOpenablePublishedDeployment(PublishedProjectDeployment $deployment): bool
    {
        if ($deployment->provider === PublishedProjectDeployment::PROVIDER_STATIC) {
            return app(DeploymentArtifactStore::class)->available($deployment)
                && (! filled($deployment->demo_html) || $this->isOpenablePreviewHtml((string) $deployment->demo_html));
        }

        return $this->isSafePublishedAppUrl((string) $deployment->public_url);
    }
}
