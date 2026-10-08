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
use App\Services\Deployments\DeploymentArtifactStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

trait CommunityPublishingPreviewEndpoints
{
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

        $html = app(DeploymentArtifactStore::class)->html($deployment);
        abort_if(! $html, 404);

        return response($html, 200)->withHeaders($this->hostedDemoHeaders());
    }
}
