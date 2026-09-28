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
use App\Services\Deployments\DeploymentArtifactStore;

trait CommunityPublishingAccess
{
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
            && app(DeploymentArtifactStore::class)->available($deployment)) {
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
}
