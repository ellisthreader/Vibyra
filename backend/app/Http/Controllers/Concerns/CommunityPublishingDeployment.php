<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use App\Models\PublishedProjectDeployment;
use App\Models\PublishedProjectReaction;
use App\Models\User;
use App\Policies\PublishedProjectPolicy;
use App\Services\Community\ProjectSafetyReview;
use App\Services\Deployments\RuntimeDemoLifecycleService;
use App\Services\Deployments\DeploymentArtifactStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

trait CommunityPublishingDeployment
{
    private function publishStaticHostedDemo(PublishedProject $project, mixed $hostedDemo, bool $pendingReview = false): void
    {
        $html = trim((string) $project->preview_html);
        $bundle = is_array($hostedDemo) && isset($hostedDemo['files']) ? $hostedDemo : null;
        if ($html === '' && $bundle === null) {
            return;
        }
        if (! $pendingReview && ! $project->isPubliclyVisible()) {
            return;
        }

        $deployment = PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => $pendingReview ? PublishedProjectDeployment::STATUS_PENDING_REVIEW : PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'provider_status' => $pendingReview ? 'awaiting_publish_review' : PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'hosting_mode' => PublishedProjectDeployment::MODE_STATIC,
            'demo_mode_enabled' => true,
            'disabled_features' => ['network_requests', 'native_permissions', 'real_payments'],
            'stack' => $project->stack,
            'public_url' => $pendingReview ? null : $this->hostedDemoPath($project),
            'entry_path' => $bundle['entryPath'] ?? null,
            'demo_html' => $bundle === null ? $html : null,
            'demo_files' => $bundle['files'] ?? null,
            'metadata' => $bundle['metadata'] ?? null,
            'hosted_at' => $pendingReview ? null : now(),
        ]);
        app(DeploymentArtifactStore::class)->persist($deployment);
    }

    private function hasHostedDemoBundle(mixed $hostedDemo): bool
    {
        return is_array($hostedDemo) && $this->normalizeHostedDemoBundle($hostedDemo) !== null;
    }

    private function hasRuntimeBundle(mixed $runtimeBundle): bool
    {
        return is_array($runtimeBundle) && $this->normalizeRuntimeBundle($runtimeBundle) !== null;
    }

    private function queueRuntimeHostedDemo(PublishedProject $project, mixed $runtimeBundle, bool $pendingReview = false): void
    {
        $bundle = is_array($runtimeBundle) && isset($runtimeBundle['files']) ? $runtimeBundle : null;
        if ($bundle === null || (! $pendingReview && ! $project->isPubliclyVisible())) {
            return;
        }

        $deployment = PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => $pendingReview ? PublishedProjectDeployment::STATUS_PENDING_REVIEW : PublishedProjectDeployment::STATUS_QUEUED,
            'provider_status' => $pendingReview ? 'awaiting_publish_review' : 'waiting_for_runtime_worker',
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'demo_mode_enabled' => true,
            'disabled_features' => ['creator_secrets', 'persistent_storage', 'real_payments'],
            'stack' => $project->stack,
            'build_command' => $bundle['buildCommand'],
            'start_command' => $bundle['startCommand'],
            'demo_files' => $bundle['files'],
            'metadata' => $bundle['metadata'],
            'last_error' => $pendingReview
                ? 'Runtime bundle is stored safely until publish review is approved.'
                : 'Runtime deployment is queued. A Railway worker must upload this source bundle and resolve a public HTTPS URL before Explore can open the backend app.',
        ]);
        app(DeploymentArtifactStore::class)->persist($deployment);
    }

    private function activateReviewedDeployments(PublishedProject $project): void
    {
        $pending = $project->deployments()
            ->where('status', PublishedProjectDeployment::STATUS_PENDING_REVIEW)
            ->latest('id')
            ->get();

        foreach ($pending->groupBy('provider') as $deployments) {
            foreach ($deployments->values() as $index => $deployment) {
                if ($index > 0) {
                    $deployment->forceFill([
                        'status' => PublishedProjectDeployment::STATUS_STOPPED,
                        'provider_status' => 'superseded',
                        'public_url' => null,
                        'last_error' => 'Superseded by a newer reviewed publish.',
                    ])->save();

                    continue;
                }
                if ($deployment->provider === PublishedProjectDeployment::PROVIDER_RAILWAY) {
                    $deployment->forceFill([
                        'status' => PublishedProjectDeployment::STATUS_QUEUED,
                        'provider_status' => 'waiting_for_runtime_worker',
                        'last_error' => 'Runtime deployment is queued after publish review approval.',
                    ])->save();

                    continue;
                }

                $deployment->forceFill([
                    'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
                    'provider_status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
                    'public_url' => $this->hostedDemoPath($project),
                    'hosted_at' => now(),
                    'last_error' => null,
                ])->save();
            }
        }

        if ($pending->isEmpty()) {
            $this->publishStaticHostedDemo($project, null);
        }
    }
}
