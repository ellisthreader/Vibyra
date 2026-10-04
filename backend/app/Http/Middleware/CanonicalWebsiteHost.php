<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * The apps talk to the API on the Railway hostname, and any website page they
 * open inherits it. Send those browser page visits to the real website; APIs,
 * downloads, updates, sign-in callbacks and app links stay on the old host.
 */
final class CanonicalWebsiteHost
{
    private const LEGACY_HOSTS = ['vibyra-production.up.railway.app', 'www.vibyra.net'];
    private const CANONICAL_ORIGIN = 'https://vibyra.net';
    private const PAGES = ['/', 'legal/*', 'login', 'signup', 'forgot-password', 'billing', 'billing/*', 'checkout',
        'downloads', 'benchmarks', 'account', 'account/downloads', 'owner', 'owner/login'];

    public function handle(Request $request, Closure $next)
    {
        if (! in_array($request->getHost(), self::LEGACY_HOSTS, true)
            || ! $request->isMethodSafe() || ! $request->is(...self::PAGES)) {
            return $next($request);
        }
        return redirect()->away(self::CANONICAL_ORIGIN.$request->getRequestUri(), 301);
    }
}
