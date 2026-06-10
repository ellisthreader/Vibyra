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

trait CommunityPublishing
{
    use CommunityPublishingPayload;

    public function communityProjects(Request $request): JsonResponse
    {
        $viewer = $this->optionalAuthenticatedUser($request);
        $projects = PublishedProject::with(['user', 'latestDeployment', 'latestSuccessfulDeployment', 'deployments'])
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
        $projects = PublishedProject::with(['user', 'latestDeployment', 'latestSuccessfulDeployment', 'deployments'])
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
        $projects = PublishedProject::with(['user', 'latestDeployment', 'latestSuccessfulDeployment', 'deployments'])
            ->whereIn('review_status', [PublishedProject::REVIEW_PENDING, PublishedProject::REVIEW_UNDER_REVIEW])
            ->latest('updated_at')
            ->limit(100)
            ->get();

        return $this->json([
            'ok' => true,
            'projects' => $projects->map(fn (PublishedProject $project) => $this->publishedProjectStatusPayload($project))->values(),
        ]);
    }

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

    private function assertPublishReviewer(User $user): void
    {
        if (! app(PublishedProjectPolicy::class)->reviewAny($user)) {
            abort($this->json(['ok' => false, 'error' => 'This account cannot review published projects.'], 403));
        }
    }

    public function communityProjectPreview(string $slug): Response
    {
        $project = $this->publicPublishedProject($slug);
        if (trim((string) $project->preview_html) === '') {
            return response($this->previewUnavailableHtml($project), 404)->withHeaders([
                'Content-Type' => 'text/html; charset=UTF-8',
                'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;",
                'X-Content-Type-Options' => 'nosniff',
                'Referrer-Policy' => 'no-referrer',
            ]);
        }

        $html = (string) $project->preview_html;

        return response($html, 200)->withHeaders([
            'Content-Type' => 'text/html; charset=UTF-8',
            'Content-Security-Policy' => "default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src https: data:;",
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        ]);
    }

    public function communityProjectHostedDemo(string $slug, ?string $path = null): Response
    {
        $project = $this->publicPublishedProject($slug);
        $deployment = $this->openableSuccessfulHostedDemo($project);
        abort_if($deployment === null || $deployment->provider !== PublishedProjectDeployment::PROVIDER_STATIC, 404);

        $file = $this->hostedDemoFile($deployment, $path);
        if ($file !== null) {
            $body = (string) ($file['body'] ?? '');
            if (($file['encoding'] ?? 'utf8') === 'base64') {
                $body = base64_decode($body, true) ?: '';
            }

            $contentType = (string) ($file['contentType'] ?? 'application/octet-stream');
            $body = $this->rewriteHostedDemoText($body, $contentType, $deployment, $project, (string) ($file['path'] ?? ''));

            return response($body, 200)->withHeaders($this->hostedDemoHeaders($contentType));
        }

        abort_if(! $deployment->demo_html, 404);

        return response((string) $deployment->demo_html, 200)->withHeaders($this->hostedDemoHeaders());
    }

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

        PublishedProjectDeployment::create([
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

        PublishedProjectDeployment::create([
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

    private function hostedDemoFile(PublishedProjectDeployment $deployment, ?string $path): ?array
    {
        $files = is_array($deployment->demo_files) ? $deployment->demo_files : [];
        if ($files === []) {
            return null;
        }

        $requested = $this->normalizeHostedDemoPath($path ?: (string) $deployment->entry_path);
        foreach ($files as $file) {
            if (($file['path'] ?? '') === $requested) {
                return $file;
            }
        }

        return null;
    }

    private function normalizeHostedDemoBundle(array $value): ?array
    {
        if (($value['ok'] ?? false) !== true) {
            return null;
        }

        $entryPath = $this->normalizeHostedDemoPath((string) ($value['entryPath'] ?? ''));
        $files = [];
        $totalBytes = 0;

        foreach (array_slice((array) ($value['files'] ?? []), 0, 220) as $file) {
            if (! is_array($file)) {
                continue;
            }
            $path = $this->normalizeHostedDemoPath((string) ($file['path'] ?? ''));
            $encoding = (string) ($file['encoding'] ?? 'utf8');
            $body = (string) ($file['body'] ?? '');
            if ($path === '' || $this->unsafeHostedDemoPath($path) || ! in_array($encoding, ['utf8', 'base64'], true) || $body === '') {
                continue;
            }
            if ($encoding === 'utf8') {
                $body = $this->neutralizeCompiledPrivateUrlLiterals($body, ['path' => $path]);
            }
            if ($encoding === 'utf8'
                && $this->containsUnsafePublishedUrl($body, ['path' => $path])) {
                return null;
            }
            $totalBytes += strlen($body);
            if ($totalBytes > 11_000_000) {
                break;
            }
            $files[] = [
                'path' => $path,
                'contentType' => Str::limit((string) ($file['contentType'] ?? 'application/octet-stream'), 120, ''),
                'encoding' => $encoding,
                'size' => min((int) ($file['size'] ?? strlen($body)), 2_000_000),
                'body' => Str::limit($body, 2_800_000, ''),
            ];
        }

        if ($entryPath === '' || $files === [] || ! $this->demoFilesContain($files, $entryPath)) {
            return null;
        }

        return [
            'entryPath' => $entryPath,
            'files' => $files,
            'metadata' => [
                'kind' => Str::limit((string) ($value['kind'] ?? 'static-demo-bundle'), 80, ''),
                'mountDirectory' => Str::limit((string) ($value['mountDirectory'] ?? ''), 240, ''),
                'source' => 'desktop-publish-demo-bundle',
                'totalFiles' => count($files),
            ],
        ];
    }

    private function normalizeRuntimeBundle(array $value): ?array
    {
        $platform = (string) ($value['platform'] ?? '');
        if (($value['ok'] ?? false) !== true || ! in_array($platform, ['node', 'laravel', 'python'], true)) {
            return null;
        }
        if ((bool) data_get($value, 'metadata.truncated', false) || count((array) ($value['files'] ?? [])) > 320) {
            return null;
        }
        $frontendDistDirectory = $platform === 'python'
            ? $this->normalizePythonFrontendDirectory((string) data_get($value, 'metadata.frontendDistDirectory', ''))
            : '';

        $files = [];
        $seenPaths = [];
        $totalBytes = 0;
        foreach ((array) ($value['files'] ?? []) as $file) {
            if (! is_array($file)) {
                return null;
            }
            $path = $this->normalizeHostedDemoPath((string) ($file['path'] ?? ''));
            $encoding = (string) ($file['encoding'] ?? 'utf8');
            $body = (string) ($file['body'] ?? '');
            if ($path === '' || $this->unsafeHostedDemoPath($path) || $this->unsafeRuntimeSourcePath($path, $platform, $frontendDistDirectory) || ! in_array($encoding, ['utf8', 'base64'], true) || $body === '') {
                return null;
            }
            if (isset($seenPaths[$path])) {
                return null;
            }
            $seenPaths[$path] = true;
            if ($encoding === 'base64' && base64_decode($body, true) === false) {
                return null;
            }
            if ($encoding === 'utf8' && $this->isGeneratedRuntimeAssetPath($path, $frontendDistDirectory)) {
                $body = $this->neutralizeCompiledPrivateUrlLiterals($body, ['path' => $path]);
            }
            if ($encoding === 'utf8'
                && $this->runtimePrivateUrlMustBePublic($path, $platform, $frontendDistDirectory)
                && $this->containsUnsafePublishedUrl($body, ['path' => $path])) {
                return null;
            }
            $totalBytes += strlen($body);
            if ($totalBytes > 10_000_000) {
                return null;
            }
            $fileLimit = $this->isGeneratedBuildAssetPath($path) ? 2_800_000 : 1_400_000;
            if (strlen($body) > $fileLimit) {
                return null;
            }
            $files[] = [
                'path' => $path,
                'contentType' => Str::limit((string) ($file['contentType'] ?? 'text/plain; charset=UTF-8'), 120, ''),
                'encoding' => $encoding,
                'size' => min((int) ($file['size'] ?? strlen($body)), $fileLimit),
                'body' => $body,
            ];
        }

        $requiredRootFiles = match ($platform) {
            'laravel' => ['composer.json'],
            'python' => ['requirements.txt', 'pyproject.toml'],
            default => ['package.json'],
        };
        if ($files === [] || ! collect($requiredRootFiles)->contains(fn (string $path) => $this->demoFilesContain($files, $path))) {
            return null;
        }
        if (trim((string) ($value['startCommand'] ?? '')) === '') {
            return null;
        }
        if ($frontendDistDirectory !== '' && (
            ! $this->demoFilesContain($files, $frontendDistDirectory.'/index.html')
            || ! $this->demoFilesContain($files, '_vibyra_runtime.py')
        )) {
            return null;
        }
        $frontendIncluded = $frontendDistDirectory !== ''
            || ($platform === 'laravel' && collect($files)->contains(
                fn (array $file) => str_starts_with((string) ($file['path'] ?? ''), 'public/build/')
            ));

        return [
            'files' => $files,
            'buildCommand' => Str::limit((string) ($value['buildCommand'] ?? ''), 320, ''),
            'startCommand' => Str::limit((string) ($value['startCommand'] ?? ''), 320, ''),
            'metadata' => [
                'kind' => 'runtime-source-bundle',
                'platform' => $platform,
                'source' => 'desktop-publish-runtime-bundle',
                'runtimeReason' => Str::limit((string) ($value['runtimeReason'] ?? ''), 220, ''),
                'totalFiles' => count($files),
                'requiresProviderWorker' => true,
                'frontendDistDirectory' => $frontendDistDirectory ?: null,
                'frontendIncluded' => $frontendIncluded,
            ],
        ];
    }

    private function publishBundleFailure(mixed $value, string $target): ?array
    {
        if (! is_array($value) || ($value['ok'] ?? null) === true) {
            return null;
        }

        $message = collect([
            $value['error'] ?? null,
            $value['message'] ?? null,
            $value['reason'] ?? null,
            data_get($value, 'failureReasons.0'),
        ])->first(fn (mixed $item) => is_string($item) && trim($item) !== '');
        $code = trim((string) ($value['code'] ?? ''));
        if ($message === null && $code === '') {
            return null;
        }

        $safeCode = preg_replace('/[^a-z0-9_.-]+/i', '_', $code) ?: '';
        $isFrontend = $target === 'frontend';
        $isFrontendLimit = $isFrontend && (
            $safeCode === 'bundle_limit_exceeded'
            || (bool) data_get($value, 'metadata.truncated', false)
        );

        return [
            'error' => $isFrontendLimit
                ? 'This frontend is too large for Vibyra hosting, so we can’t host it. Remove unnecessary build files or open a smaller app folder, then try again.'
                : Str::limit(trim((string) ($message ?? (
                    $isFrontend
                    ? 'The hosted frontend bundle could not be prepared.'
                    : 'The runtime bundle could not be prepared.'
                ))), 500, ''),
            'code' => Str::limit($safeCode ?: ($isFrontend ? 'hosted_demo_unavailable' : 'runtime_bundle_unavailable'), 100, ''),
            'hostedDemoStatus' => 'unavailable',
            'frontendStatus' => $isFrontend ? 'failed' : 'unavailable',
            'backendStatus' => $isFrontend ? 'not_included' : 'failed',
        ];
    }

    private function runtimeBundleExceedsHostingLimits(array $value): bool
    {
        if (($value['code'] ?? '') === 'runtime_bundle_limit_exceeded'
            || (bool) data_get($value, 'metadata.truncated', false)) {
            return true;
        }

        $files = (array) ($value['files'] ?? []);
        if (count($files) > 320) {
            return true;
        }

        $totalBytes = 0;
        foreach ($files as $file) {
            if (! is_array($file)) {
                continue;
            }
            $path = $this->normalizeHostedDemoPath((string) ($file['path'] ?? ''));
            $bodyBytes = strlen((string) ($file['body'] ?? ''));
            $totalBytes += $bodyBytes;
            $fileLimit = $this->isGeneratedBuildAssetPath($path) ? 2_800_000 : 1_400_000;
            if ($bodyBytes > $fileLimit || $totalBytes > 10_000_000) {
                return true;
            }
        }

        return false;
    }

    private function unsafeRuntimeSourcePath(string $path, string $platform = 'node', string $frontendDistDirectory = ''): bool
    {
        $segments = explode('/', $path);
        $blockedDirs = ['.git', '.expo', '.vibyra-agent', 'node_modules', 'vendor', 'dist', 'build', '.next', '.output'];
        foreach ($segments as $index => $segment) {
            if ($platform === 'laravel' && $segment === 'build' && ($segments[$index - 1] ?? '') === 'public') {
                continue;
            }
            if ($frontendDistDirectory !== '' && $segment === 'dist' && implode('/', array_slice($segments, 0, $index + 1)) === $frontendDistDirectory) {
                continue;
            }
            if (in_array($segment, $blockedDirs, true)) {
                return true;
            }
        }
        foreach ($segments as $segment) {
            if (preg_match('/^\.env(?:\.|$)/i', $segment) === 1) {
                return true;
            }
            if (! $this->isGeneratedBuildAssetPath($path) && preg_match('/(?:^|[-_.])(secret|token|credential|password|private[-_.]?key|api[-_.]?key)(?:[-_.]|$)/i', $segment) === 1) {
                return true;
            }
        }

        return preg_match('/\.(?:db|sqlite3?|pem|key|p12|pfx|crt|cer)$/i', $path) === 1;
    }

    private function normalizePythonFrontendDirectory(string $path): string
    {
        $path = $this->normalizeHostedDemoPath($path);

        return in_array($path, ['frontend/dist', 'client/dist', 'web/dist', 'dist'], true) ? $path : '';
    }

    private function runtimePrivateUrlMustBePublic(string $path, string $platform, string $frontendDistDirectory): bool
    {
        if ($platform === 'node') {
            return true;
        }
        if ($frontendDistDirectory !== '' && ($path === $frontendDistDirectory || str_starts_with($path, $frontendDistDirectory.'/'))) {
            return true;
        }

        return str_starts_with($path, 'public/build/');
    }

    private function runtimeReviewFiles(?array $runtimeBundle, mixed $sourceFiles): array
    {
        $runtimeFiles = [];
        $frontendDistDirectory = trim((string) data_get($runtimeBundle, 'metadata.frontendDistDirectory', ''), '/');
        foreach ((array) ($runtimeBundle['files'] ?? []) as $file) {
            if (! is_array($file) || ($file['encoding'] ?? 'utf8') !== 'utf8') {
                continue;
            }
            $path = (string) ($file['path'] ?? '');
            if (($frontendDistDirectory !== ''
                    && ($path === $frontendDistDirectory || str_starts_with($path, $frontendDistDirectory.'/')))
                || str_starts_with($path, 'public/build/')) {
                continue;
            }
            $runtimeFiles[] = [
                'path' => $path,
                'language' => pathinfo($path, PATHINFO_EXTENSION),
                'body' => (string) ($file['body'] ?? ''),
            ];
        }

        return array_slice([...$runtimeFiles, ...(is_array($sourceFiles) ? $sourceFiles : [])], 0, 80);
    }

    private function isGeneratedBuildAssetPath(string $path): bool
    {
        return preg_match('#^(?:public/)?build/assets/#i', $path) === 1;
    }

    private function isGeneratedRuntimeAssetPath(string $path, string $frontendDistDirectory): bool
    {
        return $this->isGeneratedBuildAssetPath($path)
            || ($frontendDistDirectory !== '' && str_starts_with($path, $frontendDistDirectory.'/'));
    }

    private function demoFilesContain(array $files, string $path): bool
    {
        foreach ($files as $file) {
            if (($file['path'] ?? '') === $path) {
                return true;
            }
        }

        return false;
    }

    private function normalizeHostedDemoPath(string $path): string
    {
        $path = trim(str_replace('\\', '/', $path), '/');
        $parts = array_values(array_filter(explode('/', $path), fn ($part) => $part !== '' && $part !== '.'));
        if (in_array('..', $parts, true)) {
            return '';
        }

        return implode('/', $parts);
    }

    private function unsafeHostedDemoPath(string $path): bool
    {
        return preg_match('/(^|\/)(?:\.env|\.git|\.expo|\.vibyra-agent|node_modules|vendor|secrets?|credentials?)(?:\/|$)/i', $path) === 1
            || preg_match('/\.(?:pem|key|p12|pfx|sqlite|sqlite3|db)$/i', $path) === 1;
    }

    private function rewriteHostedDemoText(string $body, string $contentType, PublishedProjectDeployment $deployment, PublishedProject $project, string $filePath): string
    {
        if (! str_contains($contentType, 'text/html') && ! str_contains($contentType, 'text/css') && ! str_contains($contentType, 'javascript')) {
            return $body;
        }

        $base = $this->hostedDemoPath($project).'/';
        $mount = trim((string) data_get($deployment->metadata, 'mountDirectory', ''), '/');
        $documentDir = trim(str_replace('\\', '/', dirname($filePath)), '. /');
        $rewrite = function (string $value) use ($base, $mount, $documentDir): string {
            $raw = trim($value);
            if ($raw === '' || preg_match('/^(?:https?:|\/\/|data:|blob:|mailto:|tel:|javascript:|#)/i', $raw) === 1) {
                return $value;
            }
            $clean = ltrim($raw, '/');
            $prefix = str_starts_with($raw, '/') ? $mount : $documentDir;

            return $base.($prefix !== '' ? trim($prefix, '/').'/' : '').$clean;
        };

        if (str_contains($contentType, 'text/html')) {
            $body = preg_replace_callback('/\b(src|href|poster)=["\']([^"\']+)["\']/i', fn ($match) => $match[1].'="'.$rewrite($match[2]).'"', $body) ?? $body;
        }

        if (str_contains($contentType, 'text/css') || str_contains($contentType, 'text/html')) {
            $body = preg_replace_callback('/url\(\s*(["\']?)([^"\')]+)\1\s*\)/i', fn ($match) => 'url('.$match[1].$rewrite($match[2]).$match[1].')', $body) ?? $body;
        }

        return $body;
    }

    public function commentOnCommunityProject(Request $request, string $slug): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $project = $this->publicPublishedProject($slug);
        $this->enforceCommunityRateLimit('comment:'.$project->id, $request, $user->id, 5, 60);
        $body = Str::limit(trim((string) $request->input('text', '')), 600, '');
        if ($body === '') {
            return $this->json(['ok' => false, 'error' => 'Add a comment before posting.'], 422);
        }
        $this->moderation->assertModerationInputAllowed(['text' => $body, 'images' => []], 'community.comment', false);
        $comment = PublishedProjectComment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'body' => $body,
        ]);
        $project->forceFill(['comments_count' => $project->comments()->count()])->save();

        return $this->json(['ok' => true, 'comment' => $this->commentPayload($comment->fresh('user'))], 201);
    }

    public function reactToCommunityProject(Request $request, string $slug): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $project = $this->publicPublishedProject($slug);
        $reaction = PublishedProjectReaction::firstOrCreate([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'type' => 'like',
        ]);
        $project->forceFill(['likes_count' => $project->reactions()->where('type', 'like')->count()])->save();

        return $this->json([
            'ok' => true,
            'liked' => true,
            'duplicate' => ! $reaction->wasRecentlyCreated,
            'likes' => $project->likes_count,
        ]);
    }

    public function removeCommunityProjectReaction(Request $request, string $slug): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $project = $this->publicPublishedProject($slug);
        PublishedProjectReaction::where([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'type' => 'like',
        ])->delete();
        $project->forceFill(['likes_count' => $project->reactions()->where('type', 'like')->count()])->save();

        return $this->json([
            'ok' => true,
            'liked' => false,
            'likes' => $project->likes_count,
        ]);
    }
}
