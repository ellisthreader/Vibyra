<?php

namespace App\Services\Account;

use App\Services\Auth\AppleClientSecret;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\ProviderIdentityVerifier;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;

/** Authorization codes are single-use: never replay an ambiguous exchange. Revoke uses durable tokens. */
final class AppleAccountRevocation
{
    public const MANUAL = 'Your Vibyra account is deleted. To finish removing Sign in with Apple access, open Settings, tap your name, then Sign in with Apple, choose Vibyra and stop using Sign in with Apple.';
    public const PENDING = 'Your Vibyra account is deleted. Apple sign-in revocation is pending and Vibyra will retry it. You can also remove Vibyra in Settings under your name, then Sign in with Apple.';

    public function native(string $code, string $subject, string $nonce): array
    {
        if ($code === '') {
            return ['status' => 'manual', 'payload' => null];
        }
        $settings = (array) config('services.apple_native_oauth', []);
        $client = trim((string) ($settings['client_id'] ?? ''));
        try {
            $response = Http::asForm()->timeout(8)->post('https://appleid.apple.com/auth/token', [
                'client_id' => $client, 'client_secret' => app(AppleClientSecret::class)->make($settings),
                'code' => $code, 'grant_type' => 'authorization_code',
            ]);
        } catch (\Throwable) {
            // It may already have consumed the code. Deletion is still authorized by the separate verified JWT.
            return ['status' => 'manual', 'payload' => null];
        }
        if (! $response->successful()) {
            return ['status' => 'manual', 'payload' => null];
        }
        $data = $response->json();
        $identity = app(ProviderIdentityVerifier::class)->verifyForAudience('apple',
            is_array($data) ? (string) ($data['id_token'] ?? '') : '', $nonce, $client);
        if (! hash_equals($subject, (string) $identity['subject'])) {
            throw new ProviderIdentityException('The Apple authorization does not match this account. Try again.');
        }
        return $this->material('native', $data['refresh_token'] ?? $data['access_token'] ?? null,
            isset($data['refresh_token']) ? 'refresh_token' : 'access_token');
    }

    /** Only called after the browser callback has verified its own state, nonce and exact account subject. */
    public function desktop(array $tokens, string $subject, string $nonce): array
    {
        $identity = app(ProviderIdentityVerifier::class)->verifyForAudience('apple', (string) ($tokens['identityToken'] ?? ''),
            $nonce, (string) config('services.apple_desktop_oauth.client_id'));
        if (! hash_equals($subject, (string) $identity['subject'])) {
            throw new ProviderIdentityException('The Apple authorization does not match this account. Try again.');
        }
        return $this->material('desktop', $tokens['appleRevocationToken'] ?? null,
            $tokens['appleRevocationHint'] ?? 'refresh_token');
    }

    private function material(string $kind, mixed $token, string $hint): array
    {
        if (! is_string($token) || $token === '' || strlen($token) > 8192
            || ! in_array($hint, ['refresh_token', 'access_token'], true)) {
            return ['status' => 'manual', 'payload' => null];
        }
        $client = trim((string) config("services.apple_{$kind}_oauth.client_id", ''));
        if ($client === '') {
            return ['status' => 'manual', 'payload' => null];
        }
        return ['status' => 'pending', 'payload' => Crypt::encryptString(json_encode([
            'kind' => $kind, 'client' => $client, 'token' => $token, 'hint' => $hint,
        ], JSON_THROW_ON_ERROR))];
    }

    /** Apple treats already-revoked tokens as successful, so a lost acknowledgement can be retried. */
    public function revoke(string $encrypted): bool
    {
        try {
            $data = json_decode(Crypt::decryptString($encrypted), true, flags: JSON_THROW_ON_ERROR);
            if (! in_array($data['kind'] ?? null, ['native', 'desktop'], true)) {
                return false;
            }
            $settings = (array) config('services.apple_'.$data['kind'].'_oauth', []);
            if (! hash_equals((string) ($settings['client_id'] ?? ''), (string) ($data['client'] ?? ''))
                || ! in_array($data['hint'] ?? null, ['refresh_token', 'access_token'], true)
                || ! is_string($data['token'] ?? null) || $data['token'] === '') {
                return false;
            }
            return Http::asForm()->timeout(8)->post('https://appleid.apple.com/auth/revoke', [
                'client_id' => $data['client'], 'client_secret' => app(AppleClientSecret::class)->make($settings),
                'token' => $data['token'], 'token_type_hint' => $data['hint'],
            ])->successful();
        } catch (\Throwable) {
            // No provider response or credential is copied into logs or the cleanup error field.
            return false;
        }
    }
}
