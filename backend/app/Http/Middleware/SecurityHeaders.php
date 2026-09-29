<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline browser protections for every response. Responses that already
 * carry their own policy (hosted demos, previews) keep it.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $policy = app(\App\Services\WebsiteContentSecurityPolicy::class);
        $nonce = $policy->prepare($request);
        $response = $next($request);
        $headers = $response->headers;

        if (! $headers->has('Content-Security-Policy')) {
            $headers->set('Content-Security-Policy', $policy->policy($nonce));
            if (str_starts_with(strtolower($headers->get('Content-Type', 'text/html')), 'text/html')) {
                // A cached HTML body must never be paired with a fresh nonce.
                $headers->set('Cache-Control', 'private, no-store');
                $headers->remove('ETag');
                $headers->remove('Last-Modified');
            }
        }
        if (! $headers->has('X-Frame-Options')) {
            $headers->set('X-Frame-Options', 'SAMEORIGIN');
        }
        $headers->set('X-Content-Type-Options', 'nosniff');
        if (! $headers->has('Referrer-Policy')) {
            $headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        }
        if (! $headers->has('Permissions-Policy')) {
            $headers->set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(self), usb=()');
        }
        if ($request->isSecure()) {
            $headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        $headers->remove('X-Powered-By');

        return $response;
    }
}
