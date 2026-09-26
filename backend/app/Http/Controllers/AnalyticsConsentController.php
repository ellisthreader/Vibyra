<?php

namespace App\Http\Controllers;

use App\Services\Analytics\ConsentStore;
use App\Services\Auth\SessionAuthenticator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnalyticsConsentController extends Controller
{
    public function show(Request $request, SessionAuthenticator $auth, ConsentStore $store): JsonResponse
    {
        $session = $this->session($request, $auth);
        if (! $session) {
            return response()->json(['error' => 'authentication_required'], 401);
        }
        $surface = $request->validate(['surface' => 'required|in:desktop,mobile'])['surface'];

        return response()->json($store->state($session, $surface))
            ->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request, SessionAuthenticator $auth, ConsentStore $store): JsonResponse
    {
        $session = $this->session($request, $auth);
        if (! $session) {
            return response()->json(['error' => 'authentication_required'], 401);
        }
        $data = $request->validate([
            'surface' => 'required|in:desktop,mobile',
            'choice' => 'required|in:declined,aggregate,linked',
            'policy_version' => 'required|integer|in:1',
        ]);
        if ($data['choice'] === 'linked' && $session->user->getAttribute('guest_at') !== null) {
            return response()->json(['error' => 'Sign in before choosing linked analytics.'], 422);
        }

        return response()->json($store->change($session, $data['surface'], $data['choice']))
            ->header('Cache-Control', 'private, no-store');
    }

    private function session(Request $request, SessionAuthenticator $auth): ?\App\Models\VibyraSession
    {
        $authenticated = $auth->authenticate((string) $request->bearerToken());

        return $authenticated['session'] ?? null;
    }
}
