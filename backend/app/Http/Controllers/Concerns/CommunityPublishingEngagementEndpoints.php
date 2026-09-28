<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use App\Models\PublishedProjectDeployment;
use App\Models\PublishedProjectReaction;
use App\Models\PublishedProjectReport;
use App\Models\User;
use App\Policies\PublishedProjectPolicy;
use App\Services\Community\ProjectSafetyReview;
use App\Services\Deployments\RuntimeDemoLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

trait CommunityPublishingEngagementEndpoints
{
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

    public function reportCommunityProject(Request $request, string $slug): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $project = $this->publicPublishedProject($slug);
        $reason = trim((string) $request->input('reason', ''));
        $details = trim((string) $request->input('details', ''));

        if (! in_array($reason, PublishedProjectReport::REASONS, true)) {
            return $this->json(['ok' => false, 'error' => 'Choose a valid report reason.'], 422);
        }
        if (mb_strlen($details) > 1000) {
            return $this->json(['ok' => false, 'error' => 'Keep the report note under 1,000 characters.'], 422);
        }

        $screenshot = $this->communityReportScreenshot($request->input('screenshot'));
        if ($screenshot === false) {
            return $this->json([
                'ok' => false,
                'error' => 'Attach a valid PNG, JPEG, WebP, or GIF screenshot under 2 MB.',
            ], 422);
        }

        $this->enforceCommunityRateLimit('report:'.$project->id, $request, $user->id, 3, 3600);
        $report = PublishedProjectReport::create([
            'published_project_id' => $project->id,
            'reporter_user_id' => $user->id,
            'reason' => $reason,
            'details' => $details !== '' ? $details : null,
            'screenshot_data_url' => $screenshot,
            'status' => PublishedProjectReport::STATUS_PENDING,
        ]);

        return $this->json([
            'ok' => true,
            'report' => [
                'id' => $report->id,
                'status' => $report->status,
                'createdAt' => $report->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    private function communityReportScreenshot(mixed $value): string|null|false
    {
        $dataUrl = trim((string) $value);
        if ($dataUrl === '') {
            return null;
        }
        if (preg_match('/^data:image\/(?:png|jpe?g|webp|gif);base64,([a-z0-9+\/=\r\n]+)$/i', $dataUrl, $match) !== 1) {
            return false;
        }

        $binary = base64_decode(preg_replace('/\s+/', '', $match[1]) ?? '', true);
        if ($binary === false || strlen($binary) > 2 * 1024 * 1024) {
            return false;
        }

        $image = @getimagesizefromstring($binary);
        $mime = is_array($image) ? (string) ($image['mime'] ?? '') : '';
        $pixels = is_array($image) ? (int) $image[0] * (int) $image[1] : 0;
        if (! in_array($mime, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true)
            || $pixels < 1 || $pixels > 16_000_000) {
            return false;
        }

        return 'data:'.$mime.';base64,'.base64_encode($binary);
    }
}
