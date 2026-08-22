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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

trait CommunityPublishingReadEndpoints
{
    public function communityProjects(Request $request): JsonResponse
    {
        $viewer = $this->optionalAuthenticatedUser($request);
        $projects = PublishedProject::with($this->deploymentSummaryRelations())
            ->where('visibility', 'public')
            ->where('review_status', PublishedProject::REVIEW_APPROVED)
            ->where(function ($query): void {
                $query->whereNotNull('preview_html')
                    ->where('preview_html', '!=', '')
                    ->orWhereHas('deployments', fn ($deployment) => $deployment->whereIn('status', PublishedProjectDeployment::SUCCESS_STATUSES));
            })
            ->latest('published_at')
            ->limit(100)
            ->get()
            ->filter(fn (PublishedProject $project) => $this->hasOpenablePublishedApp($project))
            ->take(50)
            ->values();

        return $this->json([
            'ok' => true,
            'projects' => $projects->map(fn (PublishedProject $project) => $this->communityProjectPayload($project, $viewer))->values(),
            'comments' => $this->commentsPayload($projects->pluck('id')->all()),
        ]);
    }

    public function publishedProjectStatuses(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $projects = PublishedProject::with($this->deploymentSummaryRelations())
            ->where('user_id', $user->id)
            ->latest('updated_at')
            ->limit(200)
            ->get();

        return $this->json([
            'ok' => true,
            'projects' => $projects->map(fn (PublishedProject $project) => $this->publishedProjectStatusPayload($project, $user))->values(),
        ]);
    }

    public function publishReviewQueue(Request $request): JsonResponse
    {
        $this->assertPublishReviewer($this->authenticatedUser($request));
        $projects = PublishedProject::with($this->deploymentSummaryRelations())
            ->whereIn('review_status', [PublishedProject::REVIEW_PENDING, PublishedProject::REVIEW_UNDER_REVIEW])
            ->latest('updated_at')
            ->limit(100)
            ->get();

        return $this->json([
            'ok' => true,
            'projects' => $projects->map(fn (PublishedProject $project) => $this->publishedProjectStatusPayload($project))->values(),
        ]);
    }

    private function deploymentSummaryRelations(): array
    {
        $summary = fn ($query) => $query->summary();

        return [
            'user',
            'latestDeployment' => $summary,
            'latestSuccessfulDeployment' => $summary,
            'deployments' => $summary,
        ];
    }
}
