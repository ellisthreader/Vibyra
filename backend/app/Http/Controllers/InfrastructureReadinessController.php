<?php

namespace App\Http\Controllers;

use App\Services\InfrastructureReadiness;
use Illuminate\Http\JsonResponse;

class InfrastructureReadinessController extends Controller
{
    public function __invoke(InfrastructureReadiness $readiness): JsonResponse
    {
        $result = $readiness->check();

        return response()->json($result, $result['ok'] ? 200 : 503);
    }
}
