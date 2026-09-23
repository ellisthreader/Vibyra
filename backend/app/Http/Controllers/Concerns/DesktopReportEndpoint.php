<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Reports\DiscordReportDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;

trait DesktopReportEndpoint
{
    public function reportReady(Request $request): JsonResponse
    {
        $this->authenticatedUser($request);

        return $this->json(['ok' => true, 'ready' => app(DiscordReportDelivery::class)->ready()]);
    }

    public function reportProblem(Request $request, DiscordReportDelivery $delivery): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $key = 'desktop-report:'.$user->id;
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return $this->json(['ok' => false, 'error' => 'Too many reports. Please wait before trying again.'], 429);
        }
        RateLimiter::hit($key, 3600);
        if (! $delivery->ready()) {
            return $this->json(['ok' => false, 'error' => 'Reporting is not connected on this build.'], 503);
        }
        $metadata = json_decode((string) $request->input('report', ''), true);
        if (! is_array($metadata)) {
            return $this->json(['ok' => false, 'error' => 'This report could not be read.'], 422);
        }
        $validator = Validator::make($metadata, [
            'kind' => 'required|string|in:bug,crash,visual,performance,idea,question',
            'severity' => 'required|string|in:blocker,high,normal,low',
            'summary' => 'required|string|max:300',
            'details' => 'required|string|max:8000',
            'error' => 'nullable|string|max:2000',
            'steps' => 'nullable|string|max:8000',
            'expected' => 'nullable|string|max:8000',
            'area' => 'nullable|string|max:100',
            'contact' => 'nullable|string|max:200',
            'includeDiagnostics' => 'required|boolean',
            'context' => 'required|array',
            'context.appVersion' => 'nullable|string|max:100',
            'context.platform' => 'nullable|string|max:200',
            'context.hardware' => 'nullable|string|max:500',
            'context.project' => 'nullable|string|max:200',
            'context.projectRoot' => 'nullable|string|max:500',
            'context.agent' => 'nullable|string|max:100',
            'context.model' => 'nullable|string|max:200',
            'context.renderer' => 'nullable|string|max:100',
            'context.screen' => 'nullable|string|max:100',
        ]);
        if ($validator->fails()) {
            return $this->json(['ok' => false, 'error' => 'Check the report fields and try again.'], 422);
        }
        $uploads = Validator::make($request->all(), [
            'screenshot' => 'nullable|file|image|mimes:png|max:8192',
            'images' => 'nullable|array|max:4',
            'images.*' => 'file|image|mimes:png,jpg,jpeg,gif,webp,bmp|max:8192',
            'terminalTail' => 'nullable|string|max:40000',
        ]);
        if ($uploads->fails()) {
            return $this->json(['ok' => false, 'error' => 'An attachment is too large or is not an image.'], 422);
        }
        $images = $request->file('images', []);
        $images = is_array($images) ? $images : [];
        $bytes = ($request->file('screenshot')?->getSize() ?? 0)
            + array_sum(array_map(fn ($file) => $file->getSize(), $images));
        if ($bytes > 24 * 1024 * 1024) {
            return $this->json(['ok' => false, 'error' => 'These images are too large together. Remove one and try again.'], 422);
        }
        try {
            $id = $delivery->send(
                $metadata,
                $user,
                $this->reportRequestIp($request),
                $request->file('screenshot'),
                $images,
                (string) $request->input('terminalTail', ''),
            );
        } catch (\Throwable $error) {
            report($error);

            return $this->json(['ok' => false, 'error' => 'Discord did not confirm this report. Check before retrying to avoid a duplicate.'], 502);
        }

        return $this->json(['ok' => true, 'id' => $id]);
    }

    private function reportRequestIp(Request $request): ?string
    {
        $socketIp = trim((string) $request->server('REMOTE_ADDR'));
        $carrier = filter_var($socketIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)
            && (ip2long($socketIp) >> 22) === (ip2long('100.64.0.0') >> 22);
        if (! $carrier && filter_var($socketIp, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return $socketIp;
        }

        $edgeIp = trim((string) $request->header('X-Real-IP'));

        return filter_var($edgeIp, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)
            ? $edgeIp
            : ($socketIp ?: $request->ip());
    }
}
