<?php

namespace App\Http\Middleware;

use App\Services\Analytics\CountryResolver;
use App\Services\Auth\SessionAuthenticator;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Legal\TrustedClientIp;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RequireApprovedMarket
{
    public function __construct(
        private readonly TrustedClientIp $clientIp,
        private readonly CountryResolver $countries,
        private readonly SessionAuthenticator $sessions,
    ) {}

    public function handle(Request $request, Closure $next, string $mode = 'interactive'): Response
    {
        if (! config('legal.enforce_market_access', true)) {
            return $next($request);
        }
        // Desktop's provider OAuth start is also the verified account-deletion
        // entry point. Keep that rights path available outside launch markets.
        if ($mode === 'provider-start' && $request->input('purpose') === 'deletion') {
            return $next($request);
        }
        if ($mode === 'provider-status' && app(DesktopProviderOAuthFlow::class)->isDeletionFlow(
            (string) $request->route('provider'), (string) $request->route('flowId')
        )) {
            return $next($request);
        }

        $allowed = array_values(array_filter(array_map(
            fn ($code) => strtoupper(trim((string) $code)),
            (array) config('legal.account_countries', []),
        ), fn ($code) => preg_match('/^[A-Z]{2}$/D', $code) === 1));
        $ip = $this->clientIp->forRequest($request);
        $physical = $ip ? $this->countries->forIp($ip) : null;
        if (! $physical || ! in_array($physical, $allowed, true)) {
            return $this->unavailable();
        }

        if ($mode === 'signup') {
            $declared = strtoupper(trim((string) $request->input('countryCode', '')));
            if ($declared !== $physical) {
                return $this->unavailable();
            }
        }

        $user = $request->user();
        if (! $user && $request->bearerToken()) {
            $authenticated = $this->sessions->authenticate((string) $request->bearerToken());
            $user = ($authenticated['session'] ?? null)?->user;
        }
        $accountCountry = strtoupper(trim((string) ($user?->country_code ?? '')));
        if ($accountCountry !== '' && ($accountCountry !== $physical
            || ! in_array($accountCountry, $allowed, true))) {
            return $this->unavailable();
        }

        return $next($request);
    }

    private function unavailable(): Response
    {
        return response()->json([
            'ok' => false,
            'code' => 'market_unavailable',
            'error' => 'Vibyra is not currently available in this location.',
        ], 451)->header('Cache-Control', 'no-store');
    }
}
