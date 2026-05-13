<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use App\Models\PublishedProjectReaction;
use App\Services\Community\ProjectSafetyReview;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

trait CommunityPublishing
{
    public function communityProjects(): JsonResponse
    {
        $projects = PublishedProject::with('user')
            ->where('visibility', 'public')
            ->where('review_status', PublishedProject::REVIEW_APPROVED)
            ->latest('published_at')
            ->limit(50)
            ->get();
        return $this->json([
            'ok' => true,
            'projects' => $projects->map(fn (PublishedProject $project) => $this->communityProjectPayload($project))->values(),
            'comments' => $this->commentsPayload($projects->pluck('id')->all()),
        ]);
    }

    public function publishProject(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $this->enforceCommunityRateLimit('publish', $request, $user->id, 3, 3600);
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

        $safety = $this->projectSafetyReview->review([
            'title' => $title,
            'description' => $description,
            'stack' => $stack,
            'tags' => $tags,
            'images' => array_values(array_filter([$logoImageUrl, ...$screenshotUrls])),
            'previewHtml' => (string) $request->input('previewHtml', ''),
        ]);

        $project = PublishedProject::where('user_id', $user->id)
            ->where('source_project_id', $sourceProjectId)
            ->first() ?? new PublishedProject(['user_id' => $user->id, 'source_project_id' => $sourceProjectId]);

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
            'reviewed_at' => now(),
            'published_at' => ($visibility === 'public' && $safety['public']) ? ($project->published_at ?? now()) : null,
        ])->save();

        if ($safety['status'] === ProjectSafetyReview::DENIED) {
            return $this->json([
                'ok' => false,
                'error' => $safety['reason'],
                'reviewStatus' => $safety['status'],
                'safetyFindings' => $safety['findings'],
            ], 422);
        }

        $status = $safety['status'] === ProjectSafetyReview::UNDER_REVIEW ? 202 : ($project->wasRecentlyCreated ? 201 : 200);

        return $this->json([
            'ok' => true,
            'reviewStatus' => $safety['status'],
            'isPublic' => $visibility === 'public' && (bool) $safety['public'],
            'safetyFindings' => $safety['findings'],
            'project' => $this->communityProjectPayload($project->fresh('user')),
        ], $status);
    }
    public function communityProjectPreview(string $slug): Response
    {
        $project = $this->publicPublishedProject($slug);
        $html = $project->preview_html ?: $this->previewFallbackHtml($project);
        return response($html, 200)->withHeaders([
            'Content-Type' => 'text/html; charset=UTF-8',
            'Content-Security-Policy' => "default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src https: data:;",
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        ]);
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
    private function communityProjectPayload(PublishedProject $project): array
    {
        $slug = $project->slug;

        return [
            'id' => $slug,
            'title' => $project->title,
            'description' => $project->description,
            'about' => $project->description,
            'appUrl' => "/api/community/projects/{$slug}/preview",
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
            'isPublic' => $project->isPubliclyVisible(),
            'publishedAt' => optional($project->published_at)->toIso8601String(),
            'time' => optional($project->published_at ?? $project->created_at)->diffForHumans() ?? 'Just now',
            'accent' => '#8B35FF',
            'logo' => 'default',
            'preview' => 'analytics',
            'screenshots' => $project->screenshot_urls ? array_map(fn ($i) => 'Screenshot '.($i + 1), array_keys($project->screenshot_urls)) : ['Preview'],
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
        return PublishedProject::with('user')
            ->where('slug', $slug)
            ->where('visibility', 'public')
            ->where('review_status', PublishedProject::REVIEW_APPROVED)
            ->firstOrFail();
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

    private function previewFallbackHtml(PublishedProject $project): string
    {
        $title = e($project->title);
        $description = e($project->description);
        return "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>body{background:#0b0d17;color:#f4f1ff;font-family:system-ui;margin:0;padding:24px}main{max-width:720px;margin:auto}h1{font-size:28px}p{color:#c8c2dd;line-height:1.6}</style></head><body><main><h1>{$title}</h1><p>{$description}</p></main></body></html>";
    }
}
