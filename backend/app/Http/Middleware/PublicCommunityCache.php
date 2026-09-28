<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PublicCommunityCache
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->bearerToken()) {
            $response->headers->set('Cache-Control', 'private, no-store');
        } elseif ($response->isSuccessful()) {
            $response->headers->set(
                'Cache-Control',
                'public, max-age=30, s-maxage=60, stale-while-revalidate=120'
            );
        }
        $response->headers->set('Vary', 'Accept-Encoding, Authorization, Origin');

        return $response;
    }
}
