<?php

namespace App\Services\Mcp;

use Closure;
use InvalidArgumentException;

/** Resolve an HTTPS MCP endpoint to a public address before each request. */
final class EndpointPolicy
{
    private const DENIED_V4 = [
        ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
        ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
        ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
        ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
        ['224.0.0.0', 4], ['240.0.0.0', 4],
    ];

    /** @param Closure(string): array<string>|null $lookup */
    public function __construct(private readonly ?Closure $lookup = null) {}

    /** @return array{host: string, address: string, port: int} */
    public function pin(string $url): array
    {
        if (strlen($url) > 2048 || preg_match('/[\x00-\x20\\\\]/', $url)) {
            throw new InvalidArgumentException('Use a public HTTPS MCP address.');
        }
        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || isset($parts['user'], $parts['pass']) || isset($parts['user'])
            || isset($parts['fragment']) || ($parts['port'] ?? 443) !== 443
            || !preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/D', $host)) {
            throw new InvalidArgumentException('Use a public HTTPS MCP address.');
        }
        $addresses = $this->lookup ? ($this->lookup)($host) : $this->dns($host);
        if (!$addresses || count($addresses) > 32) {
            throw new InvalidArgumentException('The MCP address did not resolve safely.');
        }
        foreach ($addresses as $address) {
            if (!is_string($address) || !self::publicIp($address)) {
                throw new InvalidArgumentException('The MCP address did not resolve to a public server.');
            }
        }
        return ['host' => $host, 'address' => $addresses[0], 'port' => 443];
    }

    private function dns(string $host): array
    {
        $records = dns_get_record($host, DNS_A | DNS_AAAA);
        $addresses = [];
        foreach ($records ?: [] as $record) {
            if (isset($record['ip'])) $addresses[] = $record['ip'];
            if (isset($record['ipv6'])) $addresses[] = $record['ipv6'];
        }
        return array_values(array_unique($addresses));
    }

    private static function publicIp(string $ip): bool
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
        $packed = inet_pton($ip);
        if ($packed === false) return false;
        if (strlen($packed) === 16) {
            // Global unicast only. Exclude the documentation and special-purpose
            // 2001::/23 block even if the runtime's filter considers it public.
            return self::inCidr($packed, '2000::', 3)
                && !self::inCidr($packed, '2001::', 23)
                && !self::inCidr($packed, '2001:db8::', 32);
        }
        foreach (self::DENIED_V4 as [$network, $bits]) {
            if (self::inCidr($packed, $network, $bits)) return false;
        }
        return true;
    }

    private static function inCidr(string $packed, string $network, int $bits): bool
    {
        $prefix = inet_pton($network);
        if ($prefix === false || strlen($packed) !== strlen($prefix)) return false;
        $whole = intdiv($bits, 8);
        if (substr($packed, 0, $whole) !== substr($prefix, 0, $whole)) return false;
        $rest = $bits % 8;
        if ($rest === 0) return true;
        $mask = (0xff << (8 - $rest)) & 0xff;
        return (ord($packed[$whole]) & $mask) === (ord($prefix[$whole]) & $mask);
    }
}
