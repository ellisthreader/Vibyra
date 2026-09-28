<?php

namespace App\Http\Controllers;

use App\Services\Analytics\WebsiteConsent;
use App\Services\Analytics\WebsiteEvents;
use App\Services\Analytics\WebsiteIngestStats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class WebsiteAnalyticsController extends Controller
{
    public function show(Request $request, WebsiteConsent $consent): JsonResponse
    {
        $current = $consent->current($request);
        unset($current['subject_hash']);
        $current['can_link'] = (bool) $request->user('web');
        return response()->json($current)->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request, WebsiteConsent $consent): JsonResponse
    {
        $data = $request->validate([
            'choice' => 'required|in:declined,aggregate,linked',
            'policy_version' => 'required|integer|in:'.WebsiteConsent::VERSION,
        ]);
        if ($data['choice'] === 'linked' && ! $request->user('web')) {
            return response()->json(['error' => 'Sign in before allowing account-linked analytics.'], 403);
        }
        $current = $consent->save($request, $data['choice']);
        unset($current['subject_hash']);
        $current['can_link'] = (bool) $request->user('web');
        return response()->json($current)->header('Cache-Control', 'private, no-store');
    }

    public function event(Request $request, WebsiteConsent $consent, WebsiteEvents $events): JsonResponse
    {
        $stats = app(WebsiteIngestStats::class);
        try {
            $data = $request->validate([
            'event' => 'required|string|max:48', 'event_id' => 'required|uuid',
            'dimension' => 'nullable|string|max:100',
            'engaged_seconds' => 'nullable|integer|min:1|max:30',
            'utm_source' => 'nullable|string|max:48', 'utm_medium' => 'nullable|string|max:32',
            'utm_campaign' => 'nullable|string|max:64',
            'referrer_domain' => 'nullable|string|max:100',
            'metric_name' => 'nullable|string|max:12',
            'metric_value' => 'nullable|integer|min:0|max:120000',
            'error_category' => 'nullable|string|max:16',
            ]);
        } catch (ValidationException $error) {
            $stats->record('rejected');
            throw $error;
        }
        $common = ['event', 'event_id', 'dimension', 'engaged_seconds'];
        $extra = match ($data['event']) {
            'website_page_view' => ['utm_source', 'utm_medium', 'utm_campaign', 'referrer_domain'],
            'website_performance' => ['metric_name', 'metric_value'],
            'website_error' => ['error_category'],
            default => [],
        };
        if (! in_array($data['event'], WebsiteEvents::CLIENT_EVENTS, true)
            || array_diff(array_keys($request->all()), [...$common, ...$extra])
            || ! $events->allowed($data['event'], $data['dimension'] ?? null,
                $data['engaged_seconds'] ?? null, $data)) {
            $stats->record('rejected');
            return response()->json(['error' => 'Unsupported analytics event.'], 422);
        }
        $accepted = $events->record($request, $consent, $data['event'],
            $data['dimension'] ?? null, $data['engaged_seconds'] ?? null, $data['event_id'], $data);
        $stats->record($accepted ? 'accepted' : 'blocked');
        return response()->json(['accepted' => $accepted], $accepted ? 202 : 403)
            ->header('Cache-Control', 'private, no-store');
    }
}
