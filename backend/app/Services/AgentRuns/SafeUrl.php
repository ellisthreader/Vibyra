<?php

namespace App\Services\AgentRuns;

/**
 * One rule for every URL that is stored, journalled or shown to a model (F-09): only http(s), no userinfo, no fragment
 * (an implicit-flow return or magic link carries its secret there), and no token-like query parameter. `page()` is for
 * URLs of arbitrary web pages and also redacts token-like path segments; provider resource links (`clean()`) keep their
 * ids. The rule is idempotent, so the Mac may apply it too before comparing a URL with an approved one.
 */
final class SafeUrl
{
    private const SECRET_KEYS = ['token', 'accesstoken', 'idtoken', 'refreshtoken', 'auth', 'authorization', 'code', 'state', 'key', 'apikey',
        'secret', 'clientsecret', 'password', 'passwd', 'pwd', 'sig', 'signature', 'jwt', 'session', 'sessionid', 'sid', 'bearer',
        'credential', 'ticket', 'otp', 'nonce'];

    /** The only fragments kept: a provider's own deep-link anchors (a Gmail thread, a GitHub comment), never a key=value or token. */
    private const ANCHORS = ['mail.google.com' => '/\A[a-z]+\/[A-Za-z0-9_-]{1,80}\z/D', 'github.com' => '/\A[a-z_]{1,30}-?\d{1,20}\z/D'];

    public static function clean(?string $url, bool $page = false): ?string
    {
        if (!is_string($url)) return null;
        $url = trim($url);
        if ($url === 'about:blank') return $url;
        $parts = parse_url($url);
        if (!$parts || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true) || empty($parts['host'])) return null;
        $path = (string) ($parts['path'] ?? '');
        if ($page) $path = implode('/', array_map(fn ($s) => self::secretLike(rawurldecode($s), 20) ? '[redacted]' : $s, explode('/', $path)));
        $query = implode('&', array_filter(explode('&', (string) ($parts['query'] ?? '')), fn ($pair) => $pair !== '' && !self::secretPair($pair)));
        $anchor = self::ANCHORS[strtolower($parts['host'])] ?? null;
        $fragment = $anchor && preg_match($anchor, (string) ($parts['fragment'] ?? '')) ? '#'.$parts['fragment'] : '';
        return strtolower($parts['scheme']).'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '').$path
            .($query !== '' ? '?'.$query : '').$fragment;
    }

    /** A web page's address: also redacts token-like path segments (magic links, reset links). */
    public static function page(?string $url): ?string
    {
        return self::clean($url, true);
    }

    /** Applies `clean()` to every link-named field (`url`, `pageUrl`, `webViewLink`, `html_url`, ...) of a result or event payload. */
    public static function scrub(array $data, int $depth = 0): array
    {
        foreach ($data as $key => $value) {
            if (is_array($value) && $depth < 8) $data[$key] = self::scrub($value, $depth + 1);
            elseif (is_string($value) && is_string($key) && preg_match('/(url|link)$/i', $key)) $data[$key] = self::clean($value);
        }
        return $data;
    }

    private static function secretPair(string $pair): bool
    {
        [$key, $value] = array_pad(explode('=', $pair, 2), 2, '');
        $name = str_replace(['-', '_'], '', strtolower(rawurldecode($key)));
        return in_array($name, self::SECRET_KEYS, true) || preg_match('/token|secret|signature|password|credential|xamz|xgoog/', $name)
            || self::secretLike(rawurldecode($value), 24);
    }

    /** A long random-looking string (hex, base64, JWT): letters and digits alternate far more than words and slugs do. */
    private static function secretLike(string $value, int $minLength): bool
    {
        if (preg_match('/\AeyJ[A-Za-z0-9_-]{5,}\./', $value)) return true;
        if (strlen($value) < $minLength || !preg_match('/\A[A-Za-z0-9_\-.~+\/=]+\z/D', $value)) return false;
        $alnum = preg_replace('/[^A-Za-z0-9]/', '', $value);
        return preg_match_all('/[A-Za-z][0-9]|[0-9][A-Za-z]/', $alnum) >= 6;
    }
}
