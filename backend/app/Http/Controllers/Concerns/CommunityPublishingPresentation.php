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

trait CommunityPublishingPresentation
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
}
