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

trait CommunityPublishingPayload
{
    private function communityProjectPayload(PublishedProject $project, ?User $viewer = null): array
    {
        $slug = $project->slug;
        $previewUrl = $this->hasPreviewHtml($project) ? "/api/community/projects/{$slug}/preview" : null;
        $publicUrl = $this->hostedDemoPublicUrl($project);
        $deploymentStatus = $this->hostedDemoStatus($project);
        $capabilities = $this->publishedAppCapabilities($project);
        $lifecycle = $this->publishedProjectLifecycle($project);
        $viewerCanManage = $viewer !== null && (int) $project->user_id === (int) $viewer->id;

        return [
            'id' => $slug,
            'sourceProjectId' => $project->source_project_id,
            'title' => $project->title,
            'description' => $project->description,
            'about' => $project->description,
            'appUrl' => $publicUrl ?: $previewUrl,
            'previewUrl' => $previewUrl,
            'publicUrl' => $publicUrl,
            'hostingMode' => $this->hostedDemoMode($project),
            'deploymentStatus' => $deploymentStatus,
            'hostedDemoStatus' => $this->hostedDemoClientStatus($deploymentStatus),
            'hostedDemoUrl' => $publicUrl,
            'hostedDemoMessage' => $this->hostedDemoClientMessage($deploymentStatus),
            ...$capabilities,
            ...$lifecycle,
            'user' => $project->user?->name ?? 'Vibyra Builder',
            'makerBio' => 'Published from Vibyra',
            'tag' => 'Recent',
            'tags' => $project->tags ?: ['Vibyra', $project->stack ?: 'App'],
            'logoImageUrl' => $project->logo_image_url,
            'screenshotUrls' => $project->screenshot_urls ?: [],
            'stack' => $project->stack,
            'likes' => (int) $project->likes_count,
            'comments' => (int) $project->comments_count,
            'reviewStatus' => $project->review_status,
            'visibility' => $project->visibility,
            'viewerCanManage' => $viewerCanManage,
            'safetyRating' => $project->safety_rating,
            'safetyScore' => (int) $project->safety_score,
            'reviewSummary' => $project->review_summary,
            'isPublic' => $lifecycle['isDiscoverable'],
            'publishedAt' => optional($project->published_at)->toIso8601String(),
            'time' => optional($project->published_at ?? $project->created_at)->diffForHumans() ?? 'Just now',
            'accent' => '#8B35FF',
            'logo' => 'default',
            'preview' => 'analytics',
            'screenshots' => $project->screenshot_urls ? array_map(fn ($i) => 'Screenshot '.($i + 1), array_keys($project->screenshot_urls)) : ['Preview'],
        ];
    }

    private function publishedProjectStatusPayload(PublishedProject $project, ?User $viewer = null): array
    {
        $publicUrl = $this->hostedDemoPublicUrl($project);
        $deploymentStatus = $this->hostedDemoStatus($project);
        $latestDeployment = $this->latestDeployment($project);
        $previewUrl = $this->hasPreviewHtml($project) ? "/api/community/projects/{$project->slug}/preview" : null;
        $capabilities = $this->publishedAppCapabilities($project);
        $lifecycle = $this->publishedProjectLifecycle($project);

        return [
            'id' => $project->slug,
            'sourceProjectId' => $project->source_project_id,
            'reviewStatus' => $project->review_status,
            'visibility' => $project->visibility,
            'viewerCanManage' => $viewer !== null && (int) $project->user_id === (int) $viewer->id,
            'isPublic' => $lifecycle['isDiscoverable'],
            'title' => $project->title,
            'description' => $project->description,
            'tags' => $project->tags ?: [],
            'logoImageUrl' => $project->logo_image_url,
            'screenshotUrls' => $project->screenshot_urls ?: [],
            'reviewReason' => $project->review_reason,
            'safetyFindings' => $project->review_flags ?: [],
            'safetyRating' => $project->safety_rating,
            'safetyScore' => (int) $project->safety_score,
            'reviewSummary' => $project->review_summary,
            'hostingMode' => $this->hostedDemoMode($project),
            'deploymentStatus' => $deploymentStatus,
            'deploymentCreatedAt' => optional($latestDeployment?->created_at)->toIso8601String(),
            'deploymentUpdatedAt' => optional($latestDeployment?->updated_at)->toIso8601String(),
            'hostedDemoStatus' => $this->hostedDemoClientStatus($deploymentStatus),
            'hostedDemoUrl' => $publicUrl,
            'hostedDemoMessage' => $this->hostedDemoClientMessage($deploymentStatus),
            'publicUrl' => $publicUrl,
            'appUrl' => $publicUrl ?: $previewUrl,
            ...$capabilities,
            ...$lifecycle,
            'updatedAt' => optional($project->updated_at)->toIso8601String(),
            'project' => $this->communityProjectPayload($project, $viewer),
        ];
    }

    private function commentsPayload(array $projectIds): array
    {
        if ($projectIds === []) return [];
        return PublishedProjectComment::with(['user', 'project'])
            ->whereIn('published_project_id', $projectIds)
            ->latest()
            ->limit(200)
            ->get()
            ->groupBy(fn (PublishedProjectComment $comment) => $comment->project?->slug)
            ->map(fn ($comments) => $comments->map(fn ($comment) => $this->commentPayload($comment))->reverse()->values())
            ->all();
    }

    private function commentPayload(PublishedProjectComment $comment): array
    {
        return [
            'id' => (string) $comment->id,
            'name' => $comment->user?->name ?? 'Vibyra Builder',
            'text' => $comment->body,
            'time' => optional($comment->created_at)->diffForHumans() ?? 'Just now',
        ];
    }
    private function publicPublishedProject(string $slug): PublishedProject
    {
        $project = PublishedProject::with('user')
            ->with(['latestDeployment', 'latestSuccessfulDeployment', 'deployments'])
            ->where('slug', $slug)
            ->where('visibility', 'public')
            ->where('review_status', PublishedProject::REVIEW_APPROVED)
            ->firstOrFail();

        abort_if(! $this->hasOpenablePublishedApp($project), 404);

        return $project;
    }

    private function hostedDemoPublicUrl(PublishedProject $project): ?string
    {
        $deployment = $this->openableSuccessfulHostedDemo($project);
        if ($deployment === null) {
            return null;
        }

        if ($this->isSafePublishedAppUrl((string) $deployment->public_url)) {
            return (string) $deployment->public_url;
        }

        if ($deployment->provider === PublishedProjectDeployment::PROVIDER_STATIC
            && ($deployment->demo_html || $deployment->demo_files)) {
            return $this->hostedDemoPath($project);
        }

        return null;
    }

    private function hostedDemoMode(PublishedProject $project): string
    {
        $successful = $this->openableSuccessfulHostedDemo($project);
        if ($successful !== null) {
            return $successful->hosting_mode ?: PublishedProjectDeployment::MODE_STATIC;
        }

        $latest = $this->latestDeployment($project);
        if ($latest !== null) {
            return $latest->hosting_mode ?: PublishedProjectDeployment::MODE_DEMO;
        }

        return 'preview';
    }

    private function hostedDemoStatus(PublishedProject $project): string
    {
        $latest = $this->latestDeployment($project);
        if ($latest !== null) {
            if ($latest->isSuccessful() && ! $this->isOpenablePublishedDeployment($latest)) {
                return $this->hasPreviewHtml($project) ? 'preview_only' : 'unavailable';
            }

            return $latest->status;
        }

        return $this->hasPreviewHtml($project) ? 'preview_only' : 'unavailable';
    }

    private function hasPreviewHtml(PublishedProject $project): bool
    {
        return $this->isOpenablePreviewHtml((string) $project->preview_html);
    }

    private function isOpenablePreviewHtml(string $html): bool
    {
        $html = trim($html);
        return $html !== ''
            && ! $this->containsUnsafePublishedUrl($html)
            && ! $this->isGeneratedSourcePreviewHtml($html);
    }

    private function isGeneratedSourcePreviewHtml(string $html): bool
    {
        $normalized = strtolower(preg_replace('/\s+/', ' ', $html) ?? $html);

        return str_contains($normalized, '<h2>project preview</h2>')
            && str_contains($normalized, '<pre><code>')
            && str_contains($normalized, '</code></pre>');
    }

    private function hasOpenablePublishedApp(PublishedProject $project): bool
    {
        return $this->hasPreviewHtml($project) || $this->hostedDemoPublicUrl($project) !== null;
    }

    private function isPublishedProjectDiscoverable(PublishedProject $project): bool
    {
        return $project->visibility === 'public'
            && $project->review_status === PublishedProject::REVIEW_APPROVED
            && $this->hasOpenablePublishedApp($project);
    }

    private function publishedProjectLifecycle(PublishedProject $project): array
    {
        $current = $this->openableSuccessfulHostedDemo($project);
        $candidate = $this->latestDeployment($project);
        $hasPreview = $this->hasPreviewHtml($project);
        $isOpenable = $current !== null || $hasPreview;
        $isDiscoverable = $project->visibility === 'public'
            && $project->review_status === PublishedProject::REVIEW_APPROVED
            && $isOpenable;

        return [
            'listingState' => $this->publishedProjectListingState(
                $project,
                $current,
                $candidate,
                $isDiscoverable
            ),
            'isDiscoverable' => $isDiscoverable,
            'isOpenable' => $isOpenable,
            'currentReleaseState' => $isOpenable ? 'live' : null,
            'candidateReleaseState' => $this->publishedProjectCandidateState(
                $current,
                $candidate,
                $hasPreview
            ),
            'currentPublicUrl' => $this->hostedDemoPublicUrl($project),
            'candidateError' => $candidate?->status === PublishedProjectDeployment::STATUS_FAILED
                ? $candidate->last_error
                : null,
            'allowedActions' => $this->publishedProjectAllowedActions($isDiscoverable),
        ];
    }

    private function publishedProjectCandidateState(
        ?PublishedProjectDeployment $current,
        ?PublishedProjectDeployment $candidate,
        bool $hasPreview
    ): ?string {
        if ($candidate === null) {
            return null;
        }

        $hasCurrentRelease = $current !== null || $hasPreview;
        $candidateIsCurrent = $current !== null && (int) $current->id === (int) $candidate->id;
        if ($candidateIsCurrent) {
            return 'live';
        }
        if ($candidate->status === PublishedProjectDeployment::STATUS_FAILED) {
            return $hasCurrentRelease ? 'update_failed' : 'failed';
        }
        if ($this->isPendingDeploymentStatus((string) $candidate->status)) {
            return $hasCurrentRelease ? 'updating' : 'building';
        }
        if ($candidate->isSuccessful() && $this->isOpenablePublishedDeployment($candidate)) {
            return 'live';
        }

        return (string) $candidate->status;
    }

    private function publishedProjectListingState(
        PublishedProject $project,
        ?PublishedProjectDeployment $current,
        ?PublishedProjectDeployment $candidate,
        bool $isDiscoverable
    ): string {
        if ($project->visibility !== 'public') {
            return $project->visibility;
        }
        if (in_array($project->review_status, [PublishedProject::REVIEW_PENDING, PublishedProject::REVIEW_UNDER_REVIEW], true)) {
            return 'under_review';
        }
        if ($project->review_status === PublishedProject::REVIEW_DENIED) {
            return 'denied';
        }

        $hasCurrentRelease = $current !== null || $this->hasPreviewHtml($project);
        $candidateIsCurrent = $current !== null && $candidate !== null && (int) $current->id === (int) $candidate->id;
        if ($hasCurrentRelease && $candidate !== null && ! $candidateIsCurrent) {
            if ($candidate->status === PublishedProjectDeployment::STATUS_FAILED) {
                return 'live_update_failed';
            }
            if ($this->isPendingDeploymentStatus((string) $candidate->status)) {
                return 'live_updating';
            }
        }
        if ($isDiscoverable) {
            return 'live';
        }
        if ($candidate?->status === PublishedProjectDeployment::STATUS_FAILED) {
            return 'failed';
        }
        if ($candidate !== null && $this->isPendingDeploymentStatus((string) $candidate->status)) {
            return 'building';
        }

        return 'unavailable';
    }

    private function isPendingDeploymentStatus(string $status): bool
    {
        return in_array($status, [
            PublishedProjectDeployment::STATUS_QUEUED,
            PublishedProjectDeployment::STATUS_UPLOADING,
            PublishedProjectDeployment::STATUS_BUILDING,
            PublishedProjectDeployment::STATUS_STARTING,
            PublishedProjectDeployment::STATUS_PENDING_REVIEW,
        ], true);
    }

    private function publishedProjectAllowedActions(bool $isDiscoverable): array
    {
        return array_values(array_filter([
            'update_listing',
            'update_visibility',
            'publish_release',
            'delete_listing',
            $isDiscoverable ? 'open' : null,
        ]));
    }

    private function hostedDemoClientStatus(string $status): string
    {
        if (in_array($status, [PublishedProjectDeployment::STATUS_LIVE, PublishedProjectDeployment::STATUS_STATIC_LIVE], true)) {
            return 'ready';
        }
        if (in_array($status, [PublishedProjectDeployment::STATUS_QUEUED, PublishedProjectDeployment::STATUS_UPLOADING, PublishedProjectDeployment::STATUS_BUILDING, PublishedProjectDeployment::STATUS_STARTING], true)) {
            return 'pending';
        }
        if ($status === PublishedProjectDeployment::STATUS_FAILED) {
            return 'failed';
        }
        return 'unavailable';
    }

    private function hostedDemoClientMessage(string $status): ?string
    {
        return match ($this->hostedDemoClientStatus($status)) {
            'ready' => 'Hosted demo ready.',
            'pending' => 'Hosted demo is still building.',
            'failed' => 'Hosted demo unavailable.',
            default => null,
        };
    }

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
            return $this->isOpenablePreviewHtml((string) $deployment->demo_html) || ! empty($deployment->demo_files);
        }

        return $this->isSafePublishedAppUrl((string) $deployment->public_url);
    }

    private function isSafePublishedAppUrl(string $url): bool
    {
        $url = trim($url);
        if ($url === '') {
            return false;
        }

        if (str_starts_with($url, '/') && ! str_starts_with($url, '//')) {
            return str_starts_with($url, '/api/community/projects/');
        }

        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($scheme !== 'https' || $host === '') {
            return false;
        }

        return ! $this->isPrivatePublishedHost($host);
    }

    private function containsUnsafePublishedUrl(string $body, array $context = []): bool
    {
        if (! preg_match_all('/(?:https?:\/\/|\/\/)[^\s"\'<>`]+/i', $body, $matches, PREG_OFFSET_CAPTURE)) {
            return false;
        }

        foreach ($matches[0] as [$rawUrl, $offset]) {
            if ($this->isAllowedPublishedUrlLiteral($rawUrl, $body, (int) $offset, $context)) {
                continue;
            }

            $url = str_starts_with($rawUrl, '//') ? 'https:'.$rawUrl : $rawUrl;
            if (filter_var($url, FILTER_VALIDATE_URL) === false || (string) parse_url($url, PHP_URL_HOST) === '') {
                continue;
            }

            if (! $this->isSafePublishedAppUrl($url)) {
                return true;
            }
        }

        return false;
    }

    private function neutralizeCompiledPrivateUrlLiterals(string $body, array $context = []): string
    {
        $path = strtolower((string) ($context['path'] ?? ''));
        if (! preg_match('/\.(?:js|mjs|cjs)$/', $path)) {
            return $body;
        }

        return preg_replace_callback(
            '/(?:https?:\/\/|\/\/)[^\s"\'<>`]+/i',
            function (array $match): string {
                $rawUrl = (string) ($match[0][0] ?? '');
                $url = str_starts_with($rawUrl, '//') ? 'https:'.$rawUrl : $rawUrl;
                $host = strtolower((string) parse_url($url, PHP_URL_HOST));

                return $host !== '' && $this->isPrivatePublishedHost($host) ? 'about:blank' : $rawUrl;
            },
            $body,
            -1,
            $count,
            PREG_OFFSET_CAPTURE
        ) ?? $body;
    }

    private function isAllowedPublishedUrlLiteral(string $rawUrl, string $body, int $offset, array $context): bool
    {
        $path = strtolower((string) ($context['path'] ?? ''));

        if ($path === 'composer.lock') {
            return true;
        }

        if (str_starts_with($path, 'config/') && str_ends_with($path, '.php') && preg_match('#^http://(?:localhost|127\.0\.0\.1(?::\d+)?)/?$#i', $rawUrl) === 1) {
            return true;
        }

        if (preg_match('#^http://www\.w3\.org/(?:1998/Math/MathML|1999/xhtml|1999/xlink|2000/svg|XML/1998/namespace)$#i', $rawUrl) === 1) {
            return true;
        }

        if (! preg_match('/\.(?:js|mjs|cjs)$/', $path)) {
            return false;
        }

        if (! preg_match('#^http://localhost/?$#i', $rawUrl)) {
            return false;
        }

        $before = substr($body, max(0, $offset - 80), 80);
        return str_contains($before, 'new URL(');
    }

    private function isPrivatePublishedHost(string $host): bool
    {
        $host = trim(strtolower($host), '[]');
        if ($host === ''
            || $host === 'localhost'
            || $host === 'host.docker.internal'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.local')
            || str_ends_with($host, '.lan')
            || str_ends_with($host, '.internal')) {
            return true;
        }

        if (str_starts_with($host, '::ffff:')) {
            $host = substr($host, 7);
        }

        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $ip = ip2long($host);
            if ($ip === false) {
                return true;
            }

            $ranges = [
                ['0.0.0.0', '0.255.255.255'],
                ['10.0.0.0', '10.255.255.255'],
                ['127.0.0.0', '127.255.255.255'],
                ['169.254.0.0', '169.254.255.255'],
                ['172.16.0.0', '172.31.255.255'],
                ['192.168.0.0', '192.168.255.255'],
            ];

            foreach ($ranges as [$start, $end]) {
                if ($ip >= ip2long($start) && $ip <= ip2long($end)) {
                    return true;
                }
            }

            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return $host === '::1'
                || str_starts_with($host, 'fe80:')
                || str_starts_with($host, 'fc')
                || str_starts_with($host, 'fd');
        }

        return false;
    }

    private function hostedDemoPath(PublishedProject $project): string
    {
        return "/api/community/projects/{$project->slug}/demo";
    }

    private function hostedDemoHeaders(string $contentType = 'text/html; charset=UTF-8'): array
    {
        $headers = [
            'Content-Type' => $contentType,
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), local-network-access=()',
            'Cross-Origin-Opener-Policy' => 'same-origin',
            'Cross-Origin-Resource-Policy' => 'same-origin',
        ];

        if (str_contains($contentType, 'text/html')) {
            $headers['Content-Security-Policy'] = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src blob:; base-uri 'none'; form-action 'none'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' https: data:; frame-ancestors 'none';";
        }

        return $headers;
    }
    private function uniquePublishedSlug(string $title): string
    {
        $base = Str::slug($title) ?: 'vibyra-project';
        $slug = $base;
        $i = 2;
        while (PublishedProject::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$i}";
            $i++;
        }
        return $slug;
    }

    private function publishTags(mixed $value, string $stack): array
    {
        $tags = is_array($value) ? $value : explode(',', (string) $value);
        $tags = array_values(array_filter(array_map(fn ($tag) => Str::limit(trim((string) $tag), 28, ''), $tags)));
        if ($stack !== '') $tags[] = $stack;
        return array_values(array_unique(array_slice($tags, 0, 8))) ?: ['Vibyra'];
    }
    private function publishVisibility(string $value): string
    {
        return in_array($value, ['public', 'unlisted', 'private'], true) ? $value : 'public';
    }
    private function enforceCommunityRateLimit(string $bucket, Request $request, int $userId, int $maxAttempts, int $decaySeconds): void
    {
        $key = 'community:'.$bucket.':'.$userId.':'.sha1((string) $request->ip());

        if (RateLimiter::tooManyAttempts($key, $maxAttempts)) {
            throw new HttpResponseException(response()->json([
                'ok' => false,
                'error' => 'Too many community actions. Please try again shortly.',
                'retryAfter' => RateLimiter::availableIn($key),
            ], 429));
        }

        RateLimiter::hit($key, $decaySeconds);
    }

    private function previewUnavailableHtml(PublishedProject $project): string
    {
        $title = e($project->title);
        return "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>body{background:#0b0d17;color:#f4f1ff;font-family:system-ui;margin:0;padding:24px}main{max-width:720px;margin:auto}h1{font-size:24px}p{color:#c8c2dd;line-height:1.6}</style></head><body><main><h1>No hosted demo captured</h1><p>{$title} was published without a frontend preview bundle. Open the project from Browse PC, confirm the desktop preview works, then publish again.</p></main></body></html>";
    }
}
