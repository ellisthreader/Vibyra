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

trait CommunityPublishingLifecycle
{
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
}
