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

trait CommunityPublishingUtilities
{
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
