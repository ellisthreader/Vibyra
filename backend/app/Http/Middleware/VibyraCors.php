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
        // Signed public data/assets have no cookies or account state. Desktop WebViews
        // and phone browser previews may read them from any origin, including opaque ones.
        if ($request->is('web-api/model-catalog', 'web-api/model-catalog/*')) {
            $response->headers->set('Access-Control-Allow-Origin', '*');
            $response->headers->remove('Access-Control-Allow-Credentials');
            $response->headers->set('Access-Control-Allow-Headers', 'If-None-Match');
            $response->headers->set('Access-Control-Allow-Methods', 'GET, OPTIONS');
            $response->headers->set('Access-Control-Expose-Headers', 'ETag');
            return $response;
        }
        // Public sandboxed demo assets need anonymous module/font loads from an opaque origin.
        if ($request->is('api/community/projects/*/demo*')
            && str_starts_with((string) $response->headers->get('Content-Security-Policy'), 'sandbox')) {
            $response->headers->set('Access-Control-Allow-Origin', '*');
            $response->headers->remove('Access-Control-Allow-Credentials');
            return $response;
        }
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

        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibyra-Public-IP, X-Vibyra-Cloud-Access, X-Vibyra-Flow-Secret');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Max-Age', '86400');

        return $response;
    }
}
