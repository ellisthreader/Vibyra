<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;
use Throwable;

class WebsiteDownloadsController extends Controller
{
    private const PUBLIC_ORIGIN = 'https://vibyra-production.up.railway.app';

    public function catalog(ReleaseDownloadController $releases): JsonResponse
    {
        if (! app()->environment('local')) {
            return $releases->index();
        }

        // The local checkout has no release volume. Read public metadata only;
        // actual downloads still pass through the public artifact integrity gate.
        try {
            $response = Http::acceptJson()->withoutRedirecting()
                ->connectTimeout(3)->timeout(10)
                ->get(self::PUBLIC_ORIGIN.'/web-api/releases');
            $payload = $response->json();
            if ($response->successful() && is_array($payload)
                && ($payload['ok'] ?? false) === true && is_array($payload['releases'] ?? null)) {
                return response()->json([
                    'ok' => true,
                    'releases' => $payload['releases'],
                    'downloadBaseUrl' => self::PUBLIC_ORIGIN,
                ])->header('Cache-Control', 'no-store');
            }
        } catch (Throwable) {
            // Return the same recoverable state for network and upstream errors.
        }

        return response()->json([
            'ok' => false,
            'error' => 'The current downloads could not be loaded. Please try again.',
        ], 503);
    }
}
