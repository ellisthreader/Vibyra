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

trait CommunityPublishingReviewEndpoint
{
    public function reviewPublishedProject(Request $request, string $slug): JsonResponse
    {
        $reviewer = $this->authenticatedUser($request);
        $this->assertPublishReviewer($reviewer);
        $decision = (string) $request->input('decision', '');
        if (! in_array($decision, [PublishedProject::REVIEW_APPROVED, PublishedProject::REVIEW_DENIED], true)) {
            return $this->json(['ok' => false, 'error' => 'Choose approve or deny for this review.'], 422);
        }

        $project = PublishedProject::with(['user', 'latestDeployment', 'latestSuccessfulDeployment'])->where('slug', $slug)->firstOrFail();
        $note = Str::limit(trim((string) $request->input('reason', '')), 500, '');
        $approved = $decision === PublishedProject::REVIEW_APPROVED;

        $project->forceFill([
            'review_status' => $decision,
            'review_reason' => $note !== '' ? $note : ($approved ? 'Approved by reviewer.' : 'Denied by reviewer.'),
            'review_summary' => $approved ? 'Approved by reviewer after human safety review.' : 'Denied by reviewer after human safety review.',
            'safety_rating' => $approved ? ($project->safety_rating === 'safe' ? 'safe' : 'caution') : 'blocked',
            'safety_score' => $approved ? max((int) $project->safety_score, 82) : min((int) $project->safety_score ?: 20, 20),
            'reviewed_at' => now(),
            'reviewed_by_user_id' => $reviewer->id,
            'published_at' => ($approved && $project->visibility === 'public') ? ($project->published_at ?? now()) : null,
        ])->save();

        if ($approved && $project->visibility === 'public') {
            $this->activateReviewedDeployments($project);
        }

        return $this->json([
            'ok' => true,
            'reviewStatus' => $project->review_status,
            'isPublic' => $this->isPublishedProjectDiscoverable($project),
            'project' => $this->communityProjectPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment'])),
            'publishStatus' => $this->publishedProjectStatusPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment'])),
        ]);
    }

    private function assertPublishReviewer(User $user): void
    {
        if (! app(PublishedProjectPolicy::class)->reviewAny($user)) {
            abort($this->json(['ok' => false, 'error' => 'This account cannot review published projects.'], 403));
        }
    }
}
