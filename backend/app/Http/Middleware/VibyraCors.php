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
            return self::withCorsHeaders(response('', 204));
        }

        return self::withCorsHeaders($next($request));
    }

    public static function withCorsHeaders(Response $response): Response
    {
        $response->headers->set('Access-Control-Allow-Origin', '*');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibyra-Public-IP');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Max-Age', '86400');

        return $response;
    }
}
