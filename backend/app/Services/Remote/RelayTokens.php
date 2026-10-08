<?php

namespace App\Services\Remote;

/**
 * The tokens the relay trusts: `v1.<claims>.<signature>`, HMAC-SHA256 with the
 * secret shared with the relay (host/relay/src/tokens.mjs verifies the same
 * shape). Stateless on purpose — the relay asks this API nothing at connect
 * time — and short-lived, so a revoked computer or a lapsed plan is felt within
 * minutes even if the relay's admin surface could not be reached.
 */
class RelayTokens
{
    public function configured(): bool
    {
        return strlen((string) config('remote.relay_secret')) >= 32;
    }

    /** @param array{role:string,hostId:string,userId:string,jti?:string} $claims */
    public function mint(array $claims, int $ttlSeconds): string
    {
        $body = $this->encode(json_encode(['v' => 1] + $claims + ['exp' => time() + $ttlSeconds], JSON_THROW_ON_ERROR));

        return "v1.{$body}.".$this->sign($body);
    }

    /** The claims of a token this secret signed and that has not expired, or null. */
    public function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3 || $parts[0] !== 'v1' || $parts[1] === '' || $parts[2] === '') {
            return null;
        }
        if (! hash_equals($this->sign($parts[1]), $parts[2])) {
            return null;
        }
        $claims = json_decode($this->decode($parts[1]) ?? '', true);
        if (! is_array($claims) || ($claims['v'] ?? null) !== 1 || ! isset($claims['exp']) || $claims['exp'] <= time()) {
            return null;
        }

        return $claims;
    }

    private function sign(string $body): string
    {
        return $this->encode(hash_hmac('sha256', $body, (string) config('remote.relay_secret'), true));
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
