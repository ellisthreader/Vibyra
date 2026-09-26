<?php
namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;

/**
 * The address a session row records for the device that made the request.
 *
 * Behind Railway (or any proxy) the socket peer is the proxy, not the phone, so a
 * public socket address is trusted as-is and a private, loopback, reserved or
 * carrier-grade NAT (100.64.0.0/10, which Railway's edge uses) address defers to
 * the first public forwarded candidate. A public socket address is never
 * overridden by a header, which keeps forwarded IPs unspoofable on direct requests.
 */
trait SessionRequestIp
{
    private function sessionRequestIp(Request $request): string
    {
        $requestIp = trim((string) ($request->server('REMOTE_ADDR') ?: $request->ip()));
        $forwardedPublicIp = $this->firstPublicSessionIp([
            (string) $request->input('publicIp', ''),
            (string) $request->header('X-Vibyra-Public-IP', ''),
            (string) $request->header('CF-Connecting-IP', ''),
            (string) $request->header('X-Real-IP', ''),
            ...(array) preg_split('/\s*,\s*/', (string) $request->header('X-Forwarded-For', ''), -1, PREG_SPLIT_NO_EMPTY),
        ]);

        if ($this->isPublicIp($requestIp)) {
            return $requestIp;
        }

        return $forwardedPublicIp ?: ($requestIp ?: (string) $request->ip());
    }

    private function firstPublicSessionIp(array $candidates): string
    {
        foreach ($candidates as $candidate) {
            $ip = trim((string) $candidate);
            if ($this->isPublicIp($ip)) {
                return $ip;
            }
        }

        return '';
    }

    private function isPublicIp(string $ip): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }

        return ! $this->isCarrierGradeNatIp($ip);
    }

    /** RFC 6598 shared address space, which PHP's reserved-range filter does not cover. */
    private function isCarrierGradeNatIp(string $ip): bool
    {
        $packed = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? ip2long($ip) : false;

        return $packed !== false && ($packed >> 22) === (ip2long('100.64.0.0') >> 22);
    }
}
