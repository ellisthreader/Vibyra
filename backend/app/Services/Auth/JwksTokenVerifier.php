<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class JwksTokenVerifier
{
    public function verify(string $token, string $jwksUrl): array
    {
        [$header, $claims, $signature, $signingInput] = $this->decode($token);
        if (($header['alg'] ?? null) !== 'RS256' || ! is_string($header['kid'] ?? null)) {
            throw new ProviderIdentityException('The identity token uses an unsupported signature.');
        }

        $key = $this->findKey($jwksUrl, $header['kid']);
        $verified = openssl_verify(
            $signingInput,
            $signature,
            $this->rsaPublicKey($key),
            OPENSSL_ALGO_SHA256
        );
        if ($verified !== 1) {
            throw new ProviderIdentityException('The identity token signature is invalid.');
        }

        return $claims;
    }

    private function decode(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new ProviderIdentityException('The identity token is malformed.');
        }

        $header = json_decode($this->base64UrlDecode($parts[0]), true);
        $claims = json_decode($this->base64UrlDecode($parts[1]), true);
        if (! is_array($header) || ! is_array($claims)) {
            throw new ProviderIdentityException('The identity token payload is malformed.');
        }

        return [$header, $claims, $this->base64UrlDecode($parts[2]), "{$parts[0]}.{$parts[1]}"];
    }

    private function findKey(string $url, string $kid): array
    {
        $key = collect($this->keys($url))->firstWhere('kid', $kid);
        if (! is_array($key)) {
            Cache::forget($this->cacheKey($url));
            $key = collect($this->keys($url))->firstWhere('kid', $kid);
        }
        if (! is_array($key)
            || ($key['kty'] ?? null) !== 'RSA'
            || (isset($key['use']) && $key['use'] !== 'sig')
            || (isset($key['alg']) && $key['alg'] !== 'RS256')) {
            throw new ProviderIdentityException('The identity token signing key was not found.');
        }

        return $key;
    }

    private function keys(string $url): array
    {
        if ($url === '') {
            throw new ProviderIdentityException('The identity provider is not configured.');
        }

        return Cache::remember($this->cacheKey($url), now()->addHour(), function () use ($url): array {
            try {
                $response = Http::acceptJson()->timeout(8)->get($url);
            } catch (\Throwable) {
                throw new ProviderIdentityException('The identity provider could not be reached.');
            }
            if (! $response->successful() || ! is_array($response->json('keys'))) {
                throw new ProviderIdentityException('The identity provider returned invalid signing keys.');
            }

            return $response->json('keys');
        });
    }

    private function rsaPublicKey(array $jwk): string
    {
        $modulus = $this->asn1Integer($this->base64UrlDecode((string) ($jwk['n'] ?? '')));
        $exponent = $this->asn1Integer($this->base64UrlDecode((string) ($jwk['e'] ?? '')));
        $rsaKey = $this->asn1Sequence($modulus.$exponent);
        $algorithm = hex2bin('300d06092a864886f70d0101010500');
        $subjectKey = $this->asn1Sequence($algorithm.$this->asn1BitString($rsaKey));

        return "-----BEGIN PUBLIC KEY-----\n"
            .chunk_split(base64_encode($subjectKey), 64, "\n")
            ."-----END PUBLIC KEY-----\n";
    }

    private function asn1Integer(string $value): string
    {
        if ($value === '') {
            throw new ProviderIdentityException('The identity provider signing key is invalid.');
        }
        if ((ord($value[0]) & 0x80) !== 0) {
            $value = "\x00".$value;
        }

        return "\x02".$this->asn1Length(strlen($value)).$value;
    }

    private function asn1Sequence(string $value): string
    {
        return "\x30".$this->asn1Length(strlen($value)).$value;
    }

    private function asn1BitString(string $value): string
    {
        $value = "\x00".$value;

        return "\x03".$this->asn1Length(strlen($value)).$value;
    }

    private function asn1Length(int $length): string
    {
        if ($length < 128) {
            return chr($length);
        }
        $encoded = ltrim(pack('N', $length), "\x00");

        return chr(0x80 | strlen($encoded)).$encoded;
    }

    private function base64UrlDecode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if ($decoded === false) {
            throw new ProviderIdentityException('The identity token encoding is invalid.');
        }

        return $decoded;
    }

    private function cacheKey(string $url): string
    {
        return 'auth-jwks:'.hash('sha256', $url);
    }
}
