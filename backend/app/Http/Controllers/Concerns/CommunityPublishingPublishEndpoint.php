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

trait CommunityPublishingPublishEndpoint
{
    public function publishProject(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $title = Str::limit(trim((string) $request->input('title', 'Untitled Project')), 90, '');
        $description = Str::limit(trim((string) $request->input('description', 'Built with Vibyra.')), 420, '');
        $stack = Str::limit(trim((string) $request->input('stack', 'App')), 60, '');
        $sourceProjectId = Str::limit(trim((string) $request->input('projectId', '')), 255, '');
        $visibility = $this->publishVisibility((string) $request->input('visibility', 'public'));
        $tags = $this->publishTags($request->input('tags', []), $stack);
        $logoImageUrl = $this->publishImageUrl((string) $request->input('logoImageUrl', ''));
        $screenshotUrls = $this->publishImageUrls($request->input('screenshotUrls', []));
        if ($sourceProjectId === '') {
            return $this->json(['ok' => false, 'error' => 'Choose a project before publishing.'], 422);
        }
        if ($title === '' || $description === '') {
            return $this->json(['ok' => false, 'error' => 'Add a project title and description before publishing.'], 422);
        }
        $project = PublishedProject::where('user_id', $user->id)
            ->where('source_project_id', $sourceProjectId)
            ->first();

        $this->enforceCommunityRateLimit('publish:'.sha1($sourceProjectId), $request, $user->id, 30, 600);

        $hostedDemoInput = $request->input('hostedDemo');
        $hostedDemo = is_array($hostedDemoInput)
            ? $this->normalizeHostedDemoBundle($hostedDemoInput)
            : null;
        $runtimeBundleInput = $request->input('runtimeBundle');
        if (is_array($runtimeBundleInput) && $this->runtimeBundleExceedsHostingLimits($runtimeBundleInput)) {
            return $this->json([
                'ok' => false,
                'error' => 'This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.',
                'code' => 'runtime_bundle_limit_exceeded',
                'hostedDemoStatus' => 'unavailable',
                'frontendStatus' => 'unavailable',
                'backendStatus' => 'failed',
            ], 422);
        }
        $runtimeBundle = is_array($runtimeBundleInput)
            ? $this->normalizeRuntimeBundle($runtimeBundleInput)
            : null;
        if (is_array($hostedDemoInput) && ($hostedDemoInput['ok'] ?? false) === true && $hostedDemo === null) {
            return $this->json([
                'ok' => false,
                'error' => 'The hosted frontend bundle was incomplete or unsafe.',
                'code' => 'hosted_demo_incomplete_or_unsafe',
                'hostedDemoStatus' => 'unavailable',
                'frontendStatus' => 'failed',
                'backendStatus' => 'not_included',
            ], 422);
        }
        if (is_array($runtimeBundleInput) && ($runtimeBundleInput['ok'] ?? false) === true && $runtimeBundle === null) {
            return $this->json([
                'ok' => false,
                'error' => 'The runtime bundle was incomplete or unsafe.',
                'code' => 'runtime_bundle_incomplete_or_unsafe',
                'hostedDemoStatus' => 'unavailable',
                'frontendStatus' => 'unavailable',
                'backendStatus' => 'failed',
            ], 422);
        }
        $hasBundleFallback = $hostedDemo !== null
            || $runtimeBundle !== null
            || $this->isOpenablePreviewHtml((string) $request->input('previewHtml', ''));
        if (! $hasBundleFallback) {
            $bundleFailure = $this->publishBundleFailure($runtimeBundleInput, 'runtime')
                ?? $this->publishBundleFailure($hostedDemoInput, 'frontend');
            if ($bundleFailure !== null) {
                return $this->json(['ok' => false, ...$bundleFailure], 422);
            }
        }
        $reviewFiles = $this->runtimeReviewFiles($runtimeBundle, $request->input('sourceFiles', []));
        $sourceReview = (array) $request->input('sourceReview', []);
        $sourceReview['totalFiles'] = max((int) ($sourceReview['totalFiles'] ?? 0), count($reviewFiles));

        $safety = $this->projectSafetyReview->review([
            'title' => $title,
            'description' => $description,
            'stack' => $stack,
            'tags' => $tags,
            'images' => array_values(array_filter([$logoImageUrl, ...$screenshotUrls])),
            'previewHtml' => (string) $request->input('previewHtml', ''),
            'sourceFiles' => $reviewFiles,
            'sourceReview' => $sourceReview,
        ]);
        $hasPublicPreviewPayload = $this->isOpenablePreviewHtml((string) ($safety['sanitizedHtml'] ?? ''))
            || $hostedDemo !== null
            || $runtimeBundle !== null;
        if ($visibility === 'public' && (bool) $safety['public'] && ! $hasPublicPreviewPayload) {
            return $this->json([
                'ok' => false,
                'error' => 'Vibyra could not capture a public app preview for this folder. Open the project from Browse PC, make sure the desktop preview works, then publish again.',
                'reviewStatus' => ProjectSafetyReview::UNDER_REVIEW,
                'isPublic' => false,
                'hostedDemoStatus' => 'unavailable',
                'hostedDemoMessage' => 'No hosted demo or preview HTML was captured.',
            ], 422);
        }

        $project = $project ?? new PublishedProject(['user_id' => $user->id, 'source_project_id' => $sourceProjectId]);

        $project->fill([
            'slug' => $project->slug ?: $this->uniquePublishedSlug($title),
            'title' => $title,
            'description' => $description,
            'stack' => $stack,
            'tags' => $tags,
            'logo_image_url' => $logoImageUrl,
            'screenshot_urls' => $screenshotUrls,
            'preview_html' => $safety['sanitizedHtml'],
            'visibility' => $visibility,
            'review_status' => $safety['status'],
            'review_flags' => $safety['findings'],
            'review_reason' => $safety['reason'],
            'safety_rating' => $safety['rating'],
            'safety_score' => $safety['score'],
            'review_summary' => $safety['summary'],
            'reviewed_at' => now(),
            'reviewed_by_user_id' => null,
            'published_at' => ($visibility === 'public' && $safety['public']) ? ($project->published_at ?? now()) : null,
        ])->save();

        if ($visibility === 'public' && $safety['status'] !== ProjectSafetyReview::DENIED) {
            $pendingReview = ! (bool) $safety['public'];
            if ($runtimeBundle !== null) {
                app(RuntimeDemoLifecycleService::class)->supersedePending($project);
            }
            $this->publishStaticHostedDemo($project, $hostedDemo, $pendingReview);
            $this->queueRuntimeHostedDemo($project, $runtimeBundle, $pendingReview);
        }

        if ($safety['status'] === ProjectSafetyReview::DENIED) {
            return $this->json([
                'ok' => false,
                'error' => $safety['reason'],
                'reviewStatus' => $safety['status'],
                'safetyRating' => $safety['rating'],
                'safetyScore' => $safety['score'],
                'reviewSummary' => $safety['summary'],
                'safetyFindings' => $safety['findings'],
                'project' => $this->communityProjectPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment']), $user),
                'publishStatus' => $this->publishedProjectStatusPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment']), $user),
            ], 422);
        }

        $status = $safety['status'] === ProjectSafetyReview::UNDER_REVIEW ? 202 : ($project->wasRecentlyCreated ? 201 : 200);

        return $this->json([
            'ok' => true,
            'reviewStatus' => $safety['status'],
            'isPublic' => $this->isPublishedProjectDiscoverable($project),
            'safetyRating' => $safety['rating'],
            'safetyScore' => $safety['score'],
            'reviewSummary' => $safety['summary'],
            'safetyFindings' => $safety['findings'],
            'project' => $this->communityProjectPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment']), $user),
            'publishStatus' => $this->publishedProjectStatusPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment']), $user),
        ], $status);
    }
}
