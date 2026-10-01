<?php

namespace App\Services\Community;

use Illuminate\Http\JsonResponse;

final class CommunityAvailability
{
    public function enabled(): bool
    {
        return (bool) config('legal.community_enabled', false);
    }

    public function unavailable(): JsonResponse
    {
        return response()->json([
            'ok' => false,
            'code' => 'community_unavailable',
            'error' => 'Community sharing is not available yet.',
        ], 503)->header('Cache-Control', 'no-store');
    }
}
