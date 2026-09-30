<?php

namespace App\Services\Remote\Passkeys;

use App\Services\Remote\RemoteAccessException;
use lbuchs\WebAuthn\WebAuthn;

/** WebAuthn primitives belong to the library; exact application origin policy belongs here. */
class WebAuthnVerifier
{
    public function server(): WebAuthn
    {
        $origin = (string) config('remote_security.origin');
        $rp = (string) config('remote_security.rp_id');
        $parts = parse_url($origin);
        if (! is_array($parts) || ($parts['host'] ?? '') !== $rp
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || ! in_array($parts['path'] ?? '', ['', '/'], true)
            || (($parts['scheme'] ?? '') !== 'https' && !(($parts['scheme'] ?? '') === 'http' && ($parts['host'] ?? '') === 'localhost'))) {
            throw new RemoteAccessException('Passkey verification is not configured.', 503);
        }
        return new WebAuthn('Vibyra', $rp, ['none'], true);
    }

    public function clientData(array $credential, string $purpose): string
    {
        if (($credential['type'] ?? null) !== 'public-key') $this->invalid();
        $bytes = self::decode($credential['response']['clientDataJSON'] ?? null, 4096);
        $data = json_decode($bytes, true);
        if (! is_array($data) || ($data['origin'] ?? null) !== config('remote_security.origin')
            || ($data['type'] ?? null) !== ($purpose === 'register' ? 'webauthn.create' : 'webauthn.get')
            || ($data['crossOrigin'] ?? false) !== false || isset($data['topOrigin'])) $this->invalid();
        return $bytes;
    }

    public static function encode(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    public static function decode(mixed $value, int $maximum = 16384): string
    {
        if (! is_string($value) || $value === '' || strlen($value) > $maximum
            || ! preg_match('/^[A-Za-z0-9_-]+$/D', $value)) throw new RemoteAccessException('Passkey verification failed. Try again.', 422);
        $bytes = base64_decode(strtr($value, '-_', '+/'), true);
        if ($bytes === false || self::encode($bytes) !== $value) throw new RemoteAccessException('Passkey verification failed. Try again.', 422);
        return $bytes;
    }

    private function invalid(): never
    {
        throw new RemoteAccessException('Passkey verification failed. Try again.', 422);
    }
}
