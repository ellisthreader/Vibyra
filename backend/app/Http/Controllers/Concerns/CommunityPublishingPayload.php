<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

trait CommunityPublishingPayload
{
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

    private function publishedProjectStatusPayload(PublishedProject $project): array
    {
        return [
            'sourceProjectId' => $project->source_project_id,
            'reviewStatus' => $project->review_status,
            'visibility' => $project->visibility,
            'isPublic' => $project->isPubliclyVisible(),
            'title' => $project->title,
            'reviewReason' => $project->review_reason,
            'safetyFindings' => $project->review_flags ?: [],
            'updatedAt' => optional($project->updated_at)->toIso8601String(),
            'project' => $this->communityProjectPayload($project),
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
