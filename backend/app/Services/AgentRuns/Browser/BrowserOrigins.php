<?php

namespace App\Services\AgentRuns\Browser;

/**
 * Site origins a person grants a teammate's browser. An origin is scheme + host +
 * non-default port, never a path. Local infrastructure (localhost, private and
 * link-local IPs, metadata hosts, single-label names) can never be granted; the
 * Mac enforces the same list again after DNS, through redirects and subresources.
 */
final class BrowserOrigins
{
    /** @return string|null the canonical origin, or null when it cannot be granted */
    public static function normalize(mixed $raw): ?string
    {
        if (!is_string($raw) || strlen($raw) > 300) return null;
        $raw = trim($raw);
        if (!str_contains($raw, '://')) $raw = 'https://'.$raw;
        $parts = parse_url($raw);
        if (!is_array($parts) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']))
            return null;
        if (isset($parts['path']) && $parts['path'] !== '/' && $parts['path'] !== '') return null;
        return self::origin($parts);
    }

    /** The origin of a full http(s) URL the model wants to open, or null. */
    public static function ofUrl(mixed $url): ?string
    {
        if (!is_string($url) || strlen($url) > 2048 || preg_match('/[\s\x00-\x1f]/', $url)) return null;
        $parts = parse_url($url);
        if (!is_array($parts) || isset($parts['user']) || isset($parts['pass'])) return null;
        return self::origin($parts);
    }

    private static function origin(array $parts): ?string
    {
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower(rtrim((string) ($parts['host'] ?? ''), '.'));
        if (!in_array($scheme, ['http', 'https'], true) || $host === '' || !self::publicHost($host)) return null;
        $port = isset($parts['port']) ? (int) $parts['port'] : null;
        if ($port === ($scheme === 'https' ? 443 : 80)) $port = null;
        return $scheme.'://'.$host.($port ? ':'.$port : '');
    }

    /** Refuses names and literal addresses that point at the Mac, its network or cloud metadata. */
    public static function publicHost(string $host): bool
    {
        $bare = trim($host, '[]');
        // The same classes the MCP endpoint policy refuses: private, CGNAT, link-local, 6to4, NAT64, IPv4-mapped, documentation (F-23).
        if (filter_var($bare, FILTER_VALIDATE_IP)) return \App\Services\Mcp\EndpointPolicy::publicIp($bare);
        if (!preg_match('/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/D', $host)) return false;
        foreach (['localhost', 'local', 'internal', 'localdomain', 'home.arpa', 'lan', 'intranet', 'corp'] as $suffix)
            if ($host === $suffix || str_ends_with($host, '.'.$suffix)) return false;
        return !in_array($host, ['metadata.google.internal', 'metadata', 'instance-data'], true);
    }

    /** @return string[] canonical, unique, sorted; aborts 422 on any origin that cannot be granted */
    public static function list(array $raw): array
    {
        $out = [];
        foreach ($raw as $value) {
            $origin = self::normalize($value);
            abort_unless($origin !== null, 422, 'Add sites as https://example.com (no path). Local and private addresses cannot be granted.');
            $out[$origin] = true;
        }
        $out = array_keys($out);
        sort($out);
        abort_unless($out !== [] && count($out) <= 20, 422, 'Grant between 1 and 20 sites.');
        return $out;
    }
}
