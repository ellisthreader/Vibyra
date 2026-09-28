<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Shows first-time website visitors a Cloudflare Turnstile check before the page.
 * A passed check sets an encrypted cookie, so returning visitors go straight through.
 */
class VerifyHuman
{
    public const COOKIE = 'vibyra_human';

    // Search crawlers skip the check so the site stays in search results.
    private const CRAWLERS = '/googlebot|bingbot|duckduckbot|applebot|yandexbot|baiduspider|slurp|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot/i';

    public static function enabled(): bool
    {
        return (bool) config('services.turnstile.enabled')
            && filled(config('services.turnstile.site_key'))
            && filled(config('services.turnstile.secret_key'));
    }

    public function handle(Request $request, Closure $next): Response
    {
        if (! self::enabled()
            || ! $request->isMethod('GET')
            || $request->cookie(self::COOKIE) === '1'
            || preg_match(self::CRAWLERS, (string) $request->userAgent())) {
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
}
