<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;

/** Nonces are issued to trusted Blade/Vite tags, never injected into rendered HTML. */
class WebsiteContentSecurityPolicy
{
    public function prepare(Request $request): string
    {
        $nonce = base64_encode(random_bytes(32));
        $request->attributes->set('vibyra.csp_nonce', $nonce);
        Vite::useCspNonce($nonce);
        return $nonce;
    }

    public function policy(string $nonce): string
    {
        // Turnstile is the sole third-party website script/frame. Billing and
        // OAuth use top-level redirects; first-party analytics use local APIs.
        $turnstile = 'https://challenges.cloudflare.com';
        $development = app()->environment('local')
            ? ' http://localhost:5173 http://127.0.0.1:5173 http://[::1]:5173' : '';
        $hmr = app()->environment('local')
            ? ' ws://localhost:5173 ws://127.0.0.1:5173 ws://[::1]:5173' : '';
        return implode('; ', [
            "default-src 'self'",
            "script-src 'self' 'nonce-{$nonce}' 'strict-dynamic' {$turnstile}{$development}",
            "script-src-attr 'none'",
            // React/Motion set individual inline style properties. Style blocks
            // still require a trusted template nonce; CSS imports are local.
            "style-src 'self' 'unsafe-inline'{$development}",
            "style-src-elem 'self' 'nonce-{$nonce}'{$development}",
            "style-src-attr 'unsafe-inline'",
            "connect-src 'self' {$turnstile}{$development}{$hmr}",
            "frame-src 'self' {$turnstile}",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "media-src 'self' blob:",
            "worker-src 'self' blob:",
            "object-src 'none'", "base-uri 'none'", "form-action 'self'",
            "frame-ancestors 'self'",
        ]);
    }
}
