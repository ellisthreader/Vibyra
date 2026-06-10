<?php

namespace App\Http\Controllers\Concerns;

use App\Services\AutoModelRouter;
use App\Services\Billing\CreditCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait AutoModelRouteEndpoint
{
    public function chatAutoRoute(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $prompt = trim((string) $request->input('prompt', ''));

        if ($prompt === '') {
            return $this->json(['ok' => false, 'error' => 'Enter a prompt for Auto to route.'], 422);
        }
        if (mb_strlen($prompt) > 8000) {
            return $this->json(['ok' => false, 'error' => 'That prompt is too long. Trim it to under 8000 characters.'], 413);
        }
        $allowedProviders = array_slice(
            array_values(array_filter(
                (array) $request->input('allowedProviders', []),
                static fn ($provider) => is_string($provider),
            )),
            0,
            12,
        );

        $routing = app(AutoModelRouter::class)->route(
            $prompt,
            $user->plan ?: 'free',
            app(CreditCalculator::class),
            $allowedProviders,
        );

        if (($routing['modelKey'] ?? 'auto') === 'auto') {
            return $this->json([
                'ok' => false,
                'error' => 'Auto could not find a terminal model included with this plan.',
            ], 409);
        }

        return $this->json([
            'ok' => true,
            'modelKey' => $routing['modelKey'],
            'autoRouting' => $routing,
        ]);
    }
}
