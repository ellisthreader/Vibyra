<?php

namespace App\Services\Remote;

/**
 * The tokens the relay trusts: `v1.<claims>.<signature>`, HMAC-SHA256 with the
 * secret shared with the relay (host/relay/src/tokens.mjs verifies the same
 * shape). Signed claims alone are not authority: every admission and renewal
 * additionally checks authoritative state;
 * admission-token expiry alone does not revoke an established connection.
 */
class RelayTokens
{
    public function configured(): bool
    {
        return strlen($this->secret()) >= 32;
    }

    /** @param array{role:string,hostId:string,userId:string,jti?:string} $claims */
    public function mint(array $claims, int $ttlSeconds): string
    {
        $body = $this->encode(json_encode(['v' => 1, 'kid' => (string) config('remote.relay_signing_key_id', 'current')] + $claims
            + ['iat' => time(), 'jti' => bin2hex(random_bytes(16)), 'exp' => time() + $ttlSeconds], JSON_THROW_ON_ERROR));

        return "v1.{$body}.".$this->sign($body);
    }

    /** The claims of a token this secret signed and that has not expired, or null. */
    public function verify(string $token, bool $renewal = false): ?array
    {
        if (! $this->configured() || strlen($token) > 4096) return null;
        $parts = explode('.', $token);
        if (count($parts) !== 3 || $parts[0] !== 'v1' || $parts[1] === '' || $parts[2] === '') {
            return null;
        }
        $claims = json_decode($this->decode($parts[1]) ?? '', true);
        if (! is_array($claims)) return null;
        $kid = $claims['kid'] ?? null;
        $current = $kid === null || $kid === config('remote.relay_signing_key_id', 'current');
        $previous = (string) config('remote.relay_signing_previous_secret');
        $overlap = time() < (int) config('remote.relay_signing_previous_until', 0)
            && strlen($previous) >= 32 && ($kid === null || $kid === config('remote.relay_signing_previous_key_id'));
        if (! ($current && hash_equals($this->sign($parts[1]), $parts[2]))
            && ! ($overlap && hash_equals($this->sign($parts[1], $previous), $parts[2]))) {
            return null;
        }
        if (! is_array($claims) || ($claims['v'] ?? null) !== 1 || ! is_int($claims['exp'] ?? null) || (! $renewal && $claims['exp'] <= time())) {
            return null;
        }

        return $claims;
    }

    private function secret(): string
    {
        return (string) (config('remote.relay_signing_secret') ?: config('remote.relay_secret'));
    }

    private function sign(string $body, ?string $secret = null): string
    {
        return $this->encode(hash_hmac('sha256', $body, $secret ?? $this->secret(), true));
    }

    private function encode(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    private function decode(string $text): ?string
    {
        $decoded = base64_decode(strtr($text, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
