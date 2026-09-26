<?php

namespace App\Http\Controllers;

use App\Services\Analytics\WebsiteConsent;
use App\Services\Analytics\WebsiteEvents;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $data = $request->validate([
            'event' => 'required|string|max:48', 'event_id' => 'required|uuid',
            'dimension' => 'required|string|max:100',
            'engaged_seconds' => 'nullable|integer|min:1|max:30',
        ]);
        if (array_diff(array_keys($request->all()), ['event', 'event_id', 'dimension', 'engaged_seconds'])
            || ! $events->allowed($data['event'], $data['dimension'], $data['engaged_seconds'] ?? null)) {
            return response()->json(['error' => 'Unsupported analytics event.'], 422);
        }
        $accepted = $events->record($request, $consent, $data['event'],
            $data['dimension'], $data['engaged_seconds'] ?? null, $data['event_id']);
        return response()->json(['accepted' => $accepted], $accepted ? 202 : 403)
            ->header('Cache-Control', 'private, no-store');
    }
}
