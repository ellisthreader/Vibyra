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

trait CommunityPublishingListingEndpoints
{
    public function updatePublishedProjectListing(Request $request, string $slug): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $project = PublishedProject::with(['user', 'latestDeployment', 'latestSuccessfulDeployment', 'deployments'])
            ->where('slug', $slug)
            ->where('user_id', $user->id)
            ->firstOrFail();

        $title = $request->exists('title')
            ? Str::limit(trim((string) $request->input('title')), 90, '')
            : $project->title;
        $description = $request->exists('description')
            ? Str::limit(trim((string) $request->input('description')), 420, '')
            : $project->description;

        if ($title === '' || $description === '') {
            return $this->json([
                'ok' => false,
                'error' => 'Add a project title and description before updating the listing.',
            ], 422);
        }

        $updates = [
            'title' => $title,
            'description' => $description,
        ];
        if ($request->exists('tags')) {
            $updates['tags'] = $this->publishTags($request->input('tags', []), (string) $project->stack);
        }
        if ($request->exists('logoImageUrl')) {
            $updates['logo_image_url'] = $this->publishImageUrl((string) $request->input('logoImageUrl', ''));
        }
        if ($request->exists('screenshotUrls')) {
            $updates['screenshot_urls'] = $this->publishImageUrls($request->input('screenshotUrls', []));
        }

        $project->fill($updates)->save();
        $fresh = $project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment', 'deployments']);

        return $this->json([
            'ok' => true,
            'action' => 'listing_updated',
            'project' => $this->communityProjectPayload($fresh, $user),
            'publishStatus' => $this->publishedProjectStatusPayload($fresh, $user),
        ]);
    }

    public function updatePublishedProjectVisibility(Request $request, string $slug): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $project = PublishedProject::with(['user', 'latestDeployment', 'latestSuccessfulDeployment', 'deployments'])
            ->where('slug', $slug)
            ->where('user_id', $user->id)
            ->firstOrFail();
        $visibility = $this->publishVisibility((string) $request->input('visibility', $project->visibility));

        if ($visibility === 'public' && ! $this->hasOpenablePublishedApp($project)) {
            return $this->json([
                'ok' => false,
                'error' => 'Add a hosted demo or preview before making this project public.',
            ], 422);
        }

        $project->forceFill([
            'visibility' => $visibility,
            'published_at' => ($visibility === 'public' && $project->review_status === PublishedProject::REVIEW_APPROVED)
                ? ($project->published_at ?? now())
                : null,
        ])->save();
        if ($visibility !== 'public') {
            app(RuntimeDemoLifecycleService::class)->retireProject($project, 'listing_private');
        }

        $fresh = $project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment', 'deployments']);

        return $this->json([
            'ok' => true,
            'project' => $this->communityProjectPayload($fresh, $user),
            'publishStatus' => $this->publishedProjectStatusPayload($fresh, $user),
        ]);
    }

    public function deletePublishedProject(Request $request, string $slug): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $project = PublishedProject::where('slug', $slug)
            ->where('user_id', $user->id)
            ->firstOrFail();
        $sourceProjectId = $project->source_project_id;
        app(RuntimeDemoLifecycleService::class)->retireProject($project, 'listing_deleted');
        $project->delete();

        return $this->json([
            'ok' => true,
            'deleted' => true,
            'slug' => $slug,
            'sourceProjectId' => $sourceProjectId,
        ]);
    }
}
