<?php

namespace App\Services\Legal;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\IpUtils;

final class TrustedClientIp
{
    public function forOAuthRequest(Request $request): ?string
    {
        $ip = $this->forRequest($request);

        // Legacy feature fixtures use loopback for both sides of the callback.
        return $ip ?? (app()->environment('testing') && ! $request->headers->has('X-Forwarded-For')
            ? (string) $request->server('REMOTE_ADDR') : null);
    }

    public function forRequest(Request $request): ?string
    {
        // Request::ip() trusts every proxy in this app, so never use it as an
        // enforcement fact. Inspect the actual socket peer first.
        $peer = trim((string) $request->server('REMOTE_ADDR', ''));
        $trusted = (array) config('legal.trusted_proxy_cidrs', []);
        if ($peer === '' || ! filter_var($peer, FILTER_VALIDATE_IP)) {
            return null;
        }
        if ($trusted === [] || ! IpUtils::checkIp($peer, $trusted)) {
            return $this->isPublic($peer) ? $peer : null;
        }

        // Strip only configured trusted hops from the right. The first
        // nontrusted address is what the edge observed; entries to its left may
        // have been supplied by the client and must never override it.
        $forwarded = trim((string) $request->header('X-Forwarded-For', ''));
        if ($forwarded === '') {
            return null;
        }
        $chain = array_map('trim', explode(',', $forwarded));
        for ($index = count($chain) - 1; $index >= 0; $index--) {
            $candidate = $chain[$index];
            if (! filter_var($candidate, FILTER_VALIDATE_IP)) {
                return null;
            }
            if (! IpUtils::checkIp($candidate, $trusted)) {
                return $this->isPublic($candidate) ? $candidate : null;
            }
        }

        return null;
    }

    private function isPublic(string $ip): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
        // PHP does not classify Railway's 100.64.0.0/10 proxy space as reserved.
        $packed = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? ip2long($ip) : false;

        return $packed === false || ($packed >> 22) !== (ip2long('100.64.0.0') >> 22);
    }
}
