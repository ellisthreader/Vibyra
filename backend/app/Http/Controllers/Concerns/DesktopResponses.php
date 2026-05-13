<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait DesktopResponses
{
    public function options(): JsonResponse
    {
        return $this->json([]);
    }

    private function authorizeToken(Request $request): void
    {
        if (! $this->desktop->tokenIsValid($request->header('Authorization'))) {
            abort(response()->json(['ok' => false, 'error' => 'Missing or invalid desktop token'], 401));
        }
    }

    private function json(array $payload, int $status = 200): JsonResponse
    {
        return response()
            ->json($payload, $status)
            ->withHeaders([
                'Access-Control-Allow-Origin' => '*',
                'Access-Control-Allow-Headers' => 'Content-Type, Authorization',
                'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
            ]);
    }
}
