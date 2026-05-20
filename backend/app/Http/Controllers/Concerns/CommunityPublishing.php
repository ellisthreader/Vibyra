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
    use CommunityPublishingPayload;
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

    public function publishedProjectStatuses(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $projects = PublishedProject::with('user')
            ->where('user_id', $user->id)
            ->latest('updated_at')
            ->limit(200)
            ->get();

        return $this->json([
            'ok' => true,
            'projects' => $projects->map(fn (PublishedProject $project) => $this->publishedProjectStatusPayload($project))->values(),
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

        if ($project && in_array($project->review_status, [PublishedProject::REVIEW_PENDING, PublishedProject::REVIEW_UNDER_REVIEW], true)) {
            return $this->json([
                'ok' => false,
                'error' => 'This project is currently under review.',
                'reviewStatus' => $project->review_status,
                'publishStatus' => $this->publishedProjectStatusPayload($project->fresh('user')),
            ], 409);
        }

        $this->enforceCommunityRateLimit('publish:'.sha1($sourceProjectId), $request, $user->id, 30, 600);

        $safety = $this->projectSafetyReview->review([
            'title' => $title,
            'description' => $description,
            'stack' => $stack,
            'tags' => $tags,
            'images' => array_values(array_filter([$logoImageUrl, ...$screenshotUrls])),
            'previewHtml' => (string) $request->input('previewHtml', ''),
        ]);

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
            'reviewed_at' => now(),
            'published_at' => ($visibility === 'public' && $safety['public']) ? ($project->published_at ?? now()) : null,
        ])->save();

        if ($safety['status'] === ProjectSafetyReview::DENIED) {
            return $this->json([
                'ok' => false,
                'error' => $safety['reason'],
                'reviewStatus' => $safety['status'],
                'safetyFindings' => $safety['findings'],
                'project' => $this->communityProjectPayload($project->fresh('user')),
                'publishStatus' => $this->publishedProjectStatusPayload($project->fresh('user')),
            ], 422);
        }

        $status = $safety['status'] === ProjectSafetyReview::UNDER_REVIEW ? 202 : ($project->wasRecentlyCreated ? 201 : 200);

        return $this->json([
            'ok' => true,
            'reviewStatus' => $safety['status'],
            'isPublic' => $visibility === 'public' && (bool) $safety['public'],
            'safetyFindings' => $safety['findings'],
            'project' => $this->communityProjectPayload($project->fresh('user')),
            'publishStatus' => $this->publishedProjectStatusPayload($project->fresh('user')),
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
}
