<?php

namespace App\Http\Controllers;

use App\Services\OpenRouterModelReleases;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OpenRouterModelReleaseController extends Controller
{
    public function index(Request $request, OpenRouterModelReleases $releases): JsonResponse
    {
        $raw = $request->query('after');
        $after = $raw === null ? null : filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        if ($after === false) {
            return response()->json(['error' => 'Invalid release cursor.'], 422);
        }

        return response()->json($releases->feed($after))
            ->header('Cache-Control', 'public, max-age=60');
    }
}
