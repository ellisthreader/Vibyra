<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use App\Models\PublishedProjectDeployment;
use App\Models\PublishedProjectReaction;
use App\Models\User;
use App\Services\Community\ProjectSafetyReview;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\RateLimiter;
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

        if ($approved) {
            $this->publishStaticHostedDemo($project, null);
        }

        return $this->json([
            'ok' => true,
            'reviewStatus' => $project->review_status,
            'isPublic' => $project->isPubliclyVisible(),
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

        $safety = $this->projectSafetyReview->review([
            'title' => $title,
            'description' => $description,
            'stack' => $stack,
            'tags' => $tags,
            'images' => array_values(array_filter([$logoImageUrl, ...$screenshotUrls])),
            'previewHtml' => (string) $request->input('previewHtml', ''),
            'sourceFiles' => $request->input('sourceFiles', []),
            'sourceReview' => $request->input('sourceReview', []),
        ]);
        $hasPublicPreviewPayload = $this->isOpenablePreviewHtml((string) ($safety['sanitizedHtml'] ?? ''))
            || $this->hasHostedDemoBundle($request->input('hostedDemo'))
            || $this->hasRuntimeBundle($request->input('runtimeBundle'));
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

        if ($visibility === 'public' && $safety['public']) {
            $this->publishStaticHostedDemo($project, $request->input('hostedDemo'));
            $this->queueRuntimeHostedDemo($project, $request->input('runtimeBundle'));
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
            'isPublic' => $visibility === 'public' && (bool) $safety['public'],
            'safetyRating' => $safety['rating'],
            'safetyScore' => $safety['score'],
            'reviewSummary' => $safety['summary'],
            'safetyFindings' => $safety['findings'],
            'project' => $this->communityProjectPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment']), $user),
            'publishStatus' => $this->publishedProjectStatusPayload($project->fresh(['user', 'latestDeployment', 'latestSuccessfulDeployment']), $user),
        ], $status);
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
        $emails = array_map('strtolower', (array) config('moderation.publish_reviewer_emails', []));
        if (! in_array(strtolower((string) $user->email), $emails, true)) {
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

    private function publishStaticHostedDemo(PublishedProject $project, mixed $hostedDemo): void
    {
        $html = trim((string) $project->preview_html);
        $bundle = is_array($hostedDemo) ? $this->normalizeHostedDemoBundle($hostedDemo) : null;
        if ($html === '' && $bundle === null) {
            return;
        }
        if (! $project->isPubliclyVisible()) {
            return;
        }

        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'provider_status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'hosting_mode' => PublishedProjectDeployment::MODE_STATIC,
            'demo_mode_enabled' => true,
            'disabled_features' => ['network_requests', 'native_permissions', 'real_payments'],
            'stack' => $project->stack,
            'public_url' => $this->hostedDemoPath($project),
            'entry_path' => $bundle['entryPath'] ?? null,
            'demo_html' => $bundle === null ? $html : null,
            'demo_files' => $bundle['files'] ?? null,
            'metadata' => $bundle['metadata'] ?? null,
            'hosted_at' => now(),
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

    private function queueRuntimeHostedDemo(PublishedProject $project, mixed $runtimeBundle): void
    {
        $bundle = is_array($runtimeBundle) ? $this->normalizeRuntimeBundle($runtimeBundle) : null;
        if ($bundle === null || ! $project->isPubliclyVisible()) {
            return;
        }

        PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_QUEUED,
            'provider_status' => 'waiting_for_runtime_worker',
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'demo_mode_enabled' => true,
            'disabled_features' => ['creator_secrets', 'persistent_storage', 'real_payments'],
            'stack' => $project->stack,
            'build_command' => $bundle['buildCommand'],
            'start_command' => $bundle['startCommand'],
            'demo_files' => $bundle['files'],
            'metadata' => $bundle['metadata'],
            'last_error' => 'Runtime deployment is queued. A Railway worker must upload this source bundle and resolve a public HTTPS URL before Explore can open the backend app.',
        ]);
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
            if ($encoding === 'utf8' && $this->containsUnsafePublishedUrl($body, ['path' => $path])) {
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

        $files = [];
        $totalBytes = 0;
        foreach (array_slice((array) ($value['files'] ?? []), 0, 320) as $file) {
            if (! is_array($file)) {
                continue;
            }
            $path = $this->normalizeHostedDemoPath((string) ($file['path'] ?? ''));
            $encoding = (string) ($file['encoding'] ?? 'utf8');
            $body = (string) ($file['body'] ?? '');
            if ($path === '' || $this->unsafeHostedDemoPath($path) || $this->unsafeRuntimeSourcePath($path, $platform) || ! in_array($encoding, ['utf8', 'base64'], true) || $body === '') {
                continue;
            }
            if ($encoding === 'utf8' && $this->containsUnsafePublishedUrl($body, ['path' => $path])) {
                return null;
            }
            $totalBytes += strlen($body);
            if ($totalBytes > 10_000_000) {
                break;
            }
            $fileLimit = $this->isGeneratedBuildAssetPath($path) ? 2_800_000 : 1_400_000;
            $files[] = [
                'path' => $path,
                'contentType' => Str::limit((string) ($file['contentType'] ?? 'text/plain; charset=UTF-8'), 120, ''),
                'encoding' => $encoding,
                'size' => min((int) ($file['size'] ?? strlen($body)), $fileLimit),
                'body' => Str::limit($body, $fileLimit, ''),
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
            ],
        ];
    }

    private function unsafeRuntimeSourcePath(string $path, string $platform = 'node'): bool
    {
        $segments = explode('/', $path);
        $blockedDirs = ['.git', '.expo', '.vibyra-agent', 'node_modules', 'vendor', 'dist', 'build', '.next', '.output'];
        foreach ($segments as $index => $segment) {
            if ($platform === 'laravel' && $segment === 'build' && ($segments[$index - 1] ?? '') === 'public') {
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

    private function isGeneratedBuildAssetPath(string $path): bool
    {
        return preg_match('#^(?:public/)?build/assets/#i', $path) === 1;
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
        if ($body === '') return $this->json(['ok' => false, 'error' => 'Add a comment before posting.'], 422);
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
