<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VibyraCors
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethod('OPTIONS')) {
            return self::withCorsHeaders(response('', 204), $request);
        }

        return self::withCorsHeaders($next($request), $request);
    }

    public static function withCorsHeaders(Response $response, ?Request $request = null): Response
    {
        $request ??= request();
        $origin = trim((string) $request->headers->get('Origin', ''));
        $allowAnyOrigin = (bool) config('vibyra_cors.allow_any_origin', false);
        $allowedOrigins = array_values((array) config('vibyra_cors.allowed_origins', []));

        $response->headers->remove('Access-Control-Allow-Origin');
        if ($allowAnyOrigin) {
            $response->headers->set('Access-Control-Allow-Origin', '*');
        } elseif ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
        }

        if (! $allowAnyOrigin) {
            $response->setVary('Origin', false);
        }

        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibyra-Public-IP');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Max-Age', '86400');

        return $response;
    }
}
