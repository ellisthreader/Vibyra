<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Shows first-time website visitors a Cloudflare Turnstile check before the page.
 * A passed check sets an encrypted cookie, so returning visitors go straight through.
 * Form endpoints use it as `VerifyHuman::class.':api'` and simply require that cookie.
 */
class VerifyHuman
{
    public const COOKIE = 'vibyra_human';

    // Search engines are let through only when reverse DNS proves who they are.
    private const SEARCH_CRAWLERS = [
        '/googlebot|google-inspectiontool|googleother/i' => ['.googlebot.com', '.google.com', '.googleusercontent.com'],
        '/bingbot|msnbot/i' => ['.search.msn.com'],
        '/applebot/i' => ['.applebot.apple.com'],
    ];

    public static function enabled(): bool
    {
        return (bool) config('services.turnstile.enabled')
            && filled(config('services.turnstile.site_key'))
            && filled(config('services.turnstile.secret_key'));
    }

    public function handle(Request $request, Closure $next, string $mode = 'page'): Response
    {
        if (! self::enabled() || $request->cookie(self::COOKIE) === '1') {
            return $next($request);
        }

        if ($mode === 'api') {
            return response()->json([
                'ok' => false,
                'code' => 'human_check_required',
                'error' => 'Refresh the page to finish the quick human check, then try again.',
            ], 403);
        }

        if (! $request->isMethod('GET') || $this->isAllowedBot($request)) {
            return $next($request);
        }

        return response()
            ->view('human-check', [
                'siteKey' => config('services.turnstile.site_key'),
                'returnTo' => $request->getRequestUri(),
                'failed' => $request->boolean('check_failed'),
            ], 403)
            ->header('Cache-Control', 'private, no-store')
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }

    private function isAllowedBot(Request $request): bool
    {
        $agent = (string) $request->userAgent();
        foreach (self::SEARCH_CRAWLERS as $pattern => $domains) {
            if (preg_match($pattern, $agent)) {
                return $this->reverseDnsMatches((string) $request->ip(), $domains);
            }
        }

        return false;
    }

    /** Forward-confirmed reverse DNS, the check Google and Bing document for their crawlers. */
    private function reverseDnsMatches(string $ip, array $domains): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }

        return Cache::remember('verified-crawler:'.hash('sha256', $ip.implode(',', $domains)), now()->addDay(), function () use ($ip, $domains): bool {
            $host = @gethostbyaddr($ip);
            if (! is_string($host) || $host === $ip) {
                return false;
            }
            $host = strtolower($host);
            $matches = false;
            foreach ($domains as $domain) {
                $matches = $matches || str_ends_with($host, $domain);
            }
            if (! $matches) {
                return false;
            }
            $records = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
            foreach ($records as $record) {
                if (@inet_pton((string) ($record['ip'] ?? $record['ipv6'] ?? '')) === @inet_pton($ip)) {
                    return true;
                }
            }

            return false;
        });
    }
}
