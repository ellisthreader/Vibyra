<?php

namespace App\Http\Controllers;

use App\Services\Analytics\EventContract;
use App\Services\Analytics\ConsentStore;
use App\Services\Analytics\CountryResolver;
use App\Services\Auth\SessionAuthenticator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AnalyticsEventController extends Controller
{
    public function __invoke(
        Request $request,
        SessionAuthenticator $auth,
        EventContract $contract,
        ConsentStore $consents,
        CountryResolver $countries,
    ): JsonResponse
    {
        if (! config('owner_analytics.ingestion_enabled', true)) {
            return response()->json(['accepted' => false, 'error' => 'analytics_unavailable'], 403);
        }
        $authenticated = $auth->authenticate((string) $request->bearerToken());
        $session = $authenticated['session'] ?? null;
        $user = $session?->user;
        if (! $user) {
            return response()->json(['ok' => false, 'error' => 'Authentication required.'], 401);
        }

        $data = $request->validate([
            'surface' => 'required|in:desktop,mobile',
            'event' => 'required|string|max:48',
            'event_id' => 'required|uuid',
            'occurred_at' => 'nullable|date',
            'properties' => 'nullable|array',
            'consent_mode' => 'nullable|in:aggregate,linked',
        ]);
        $properties = $data['properties'] ?? [];
        $dimension = $contract->validate($data['surface'], $data['event'], $properties);
        $occurredAt = isset($data['occurred_at']) ? Carbon::parse($data['occurred_at']) : now();
        if ($occurredAt->lt(now()->subDays(7)) || $occurredAt->gt(now()->addMinutes(5))) {
            return response()->json(['ok' => false, 'error' => 'Event time is out of range.'], 422);
        }

        $country = $countries->forIp($request->ip());
        $accepted = DB::transaction(function () use (
            $user, $session, $data, $properties, $dimension, $occurredAt, $country, $consents
        ): bool {
            $choice = $consents->allowedChoiceForUpdate($session, $data['surface']);
            if (! $choice) {
                return false;
            }
            DB::table('analytics_events')->insertOrIgnore([
                'event_id' => $data['event_id'],
                'user_id' => $choice === 'linked' && ($data['consent_mode'] ?? 'aggregate') === 'linked'
                    ? $user->id : null,
                'surface' => $data['surface'],
                'event' => $data['event'],
                'dimension' => $dimension,
                'platform' => $properties['platform'] ?? null,
                'provider' => $properties['provider'] ?? null,
                'model' => $properties['model'] ?? null,
                'effort' => $properties['effort'] ?? null,
                'screen' => $properties['screen'] ?? null,
                'project_kind' => $properties['project_kind'] ?? null,
                'consent_subject_hash' => $consents->subjectHash($session, $data['surface']),
                'country_code' => $country,
                'engaged_seconds' => $properties['seconds'] ?? null,
                'schema_version' => 1,
                'visitor_hash' => null,
                'properties' => json_encode($properties, JSON_THROW_ON_ERROR),
                'occurred_at' => $occurredAt,
                'created_at' => now(),
            ]);

            return true;
        });
        if (! $accepted) {
            return response()->json(['accepted' => false, 'error' => 'analytics_consent_required'], 403);
        }

        return response()->json(['accepted' => true], 202);
    }
}
