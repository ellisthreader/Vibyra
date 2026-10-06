<?php
namespace App\Services\LiveStatus;

/**
 * APNs provider authentication token: an ES256 JWT signed with the owner's .p8 key.
 * Apple accepts one for at most an hour and throttles refreshes more often than every
 * twenty minutes, so one is kept for forty and then replaced. The key text is read
 * from configuration only and never logged.
 */
final class ApnsJwt
{
    private const CACHE = "live-status:apns-jwt";

    public function configured(): bool
    {
        return $this->keyText() !== null && (string) config('live_status.apns.key_id') !== ''
            && (string) config('live_status.apns.team_id') !== '';
    }

    public function token(?int $now = null): string
    {
        $now ??= time();
        // Shared across requests and workers: Apple refuses provider tokens refreshed too often.
        $cached = \Illuminate\Support\Facades\Cache::get(self::CACHE);
        if (is_string($cached) && $cached !== "") return $cached;
        $key = openssl_pkey_get_private((string) $this->keyText());
        if (!$key) throw new \RuntimeException('The APNs auth key could not be read.');
        $header = self::b64(json_encode(['alg' => 'ES256', 'kid' => (string) config('live_status.apns.key_id')]));
        $claims = self::b64(json_encode(['iss' => (string) config('live_status.apns.team_id'), 'iat' => $now]));
        if (!openssl_sign("$header.$claims", $der, $key, OPENSSL_ALGO_SHA256)) throw new \RuntimeException('Signing the APNs token failed.');
        $token = "$header.$claims.".self::b64(self::derToRaw($der));
        \Illuminate\Support\Facades\Cache::put(self::CACHE, $token, 2400);
        return $token;
    }

    public function forget(): void
    {
        \Illuminate\Support\Facades\Cache::forget(self::CACHE);
    }

    private function keyText(): ?string
    {
        $inline = config('live_status.apns.key');
        if (is_string($inline) && trim($inline) !== '') return str_replace('\n', "\n", $inline);
        $path = config('live_status.apns.key_path');
        return is_string($path) && $path !== '' && is_readable($path) ? (string) file_get_contents($path) : null;
    }

    /** OpenSSL returns an ASN.1 DER signature; JWT wants the 64-byte r||s form. */
    public static function derToRaw(string $der): string
    {
        $offset = 2 + (ord($der[1]) & 0x80 ? (ord($der[1]) & 0x7F) : 0);
        $parts = [];
        for ($i = 0; $i < 2; $i++) {
            $length = ord($der[$offset + 1]);
            $int = substr($der, $offset + 2, $length);
            $parts[] = str_pad(ltrim($int, "\x00"), 32, "\x00", STR_PAD_LEFT);
            $offset += 2 + $length;
        }
        return $parts[0].$parts[1];
    }

    public static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
