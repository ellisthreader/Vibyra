<?php

namespace App\Http\Controllers;

use App\Services\Analytics\OwnerReport;
use App\Services\Analytics\OwnerProductionSnapshot;
use App\Http\Middleware\LocalOwnerAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerAnalyticsController extends Controller
{
    public function __invoke(Request $request, OwnerReport $report, OwnerProductionSnapshot $snapshot): JsonResponse
    {
        $input = $request->query('days', '30');
        if (! is_string($input) || ! in_array($input, ['7', '30', '90'], true)) {
            return response()->json(['ok' => false, 'error' => 'Choose 7, 30, or 90 days.'], 422);
        }

        $result = $report->read((int) $input);
        if ($request->user('web')?->email === LocalOwnerAccess::EMAIL) {
            $result = $snapshot->apply($result, (int) $input);
            if ($result === null) {
                return response()->json(['ok' => false, 'error' => 'Production snapshot unavailable. Refresh the local owner data.'], 503)
                    ->header('Cache-Control', 'private, no-store');
            }
        }

        return response()->json(['ok' => true, ...$result])
            ->header('Cache-Control', 'private, no-store');
    }
}
