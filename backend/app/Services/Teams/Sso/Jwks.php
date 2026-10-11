<?php

namespace App\Services\Teams\Sso;

use App\Services\AgentRuns\Mcp\{McpError, SafeHttp};
use Illuminate\Support\Facades\Cache;

/** The provider's signing keys, fetched through SafeHttp and cached an hour; an unknown `kid` refetches once a minute at most. */
final class Jwks
{
    public function __construct(private readonly SafeHttp $http) {}

    /** The RSA signing key for `$kid` as a PEM public key. */
    public function pem(string $uri, string $kid): string
    {
        $keys = $this->keys($uri, false);
        $jwk = $this->find($keys, $kid);
        if (!$jwk && Cache::add('team-sso:jwks-refetch:'.hash('sha256', $uri), 1, 60)) $jwk = $this->find($this->keys($uri, true), $kid);
        if (!$jwk) throw new SsoException('sso_token', 'The signing key was not found.');
        return self::toPem($jwk);
    }

    private function find(array $keys, string $kid): ?array
    {
        foreach ($keys as $k) {
            if (is_array($k) && ($k['kid'] ?? null) === $kid && ($k['kty'] ?? null) === 'RSA' && (($k['use'] ?? 'sig') === 'sig') && (($k['alg'] ?? 'RS256') === 'RS256')) return $k;
        }
        return null;
    }

    private function keys(string $uri, bool $fresh): array
    {
        $cache = 'team-sso:jwks:'.hash('sha256', $uri);
        if (!$fresh && is_array($hit = Cache::get($cache))) return $hit;
        try {
            $response = $this->http->send('GET', $uri, ['headers' => ['Accept' => 'application/json']]);
        } catch (McpError) {
            throw new SsoException('sso_provider', 'The signing keys could not be fetched.');
        }
        $keys = $response->successful() ? $response->json('keys') : null;
        if (!is_array($keys) || count($keys) > 50) throw new SsoException('sso_provider', 'The provider returned invalid signing keys.');
        Cache::put($cache, $keys, now()->addHour());
        return $keys;
    }

    /** RSA JWK (n, e) to a PEM SubjectPublicKeyInfo, so openssl_verify can use it. */
    public static function toPem(array $jwk): string
    {
        $n = self::b64((string) ($jwk['n'] ?? ''));
        $e = self::b64((string) ($jwk['e'] ?? ''));
        if ($n === '' || $e === '' || strlen($n) < 256) throw new SsoException('sso_token', 'The signing key is invalid or too small.');
        $rsa = self::seq(self::int($n).self::int($e));
        $spki = self::seq(hex2bin('300d06092a864886f70d0101010500')."\x03".self::len(strlen($rsa) + 1)."\x00".$rsa);
        return "-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode($spki), 64, "\n")."-----END PUBLIC KEY-----\n";
    }

    public static function b64(string $value): string
    {
        $out = base64_decode(strtr($value, '-_', '+/'), true);
        return $out === false ? '' : $out;
    }

    private static function int(string $v): string
    {
        $v = ((ord($v[0]) & 0x80) ? "\x00" : '').$v;
        return "\x02".self::len(strlen($v)).$v;
    }

    private static function seq(string $v): string
    {
        return "\x30".self::len(strlen($v)).$v;
    }

    private static function len(int $n): string
    {
        if ($n < 128) return chr($n);
        $b = ltrim(pack('N', $n), "\x00");
        return chr(0x80 | strlen($b)).$b;
    }
}
