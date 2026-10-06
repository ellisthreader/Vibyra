<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\{Cache, Crypt};
use Illuminate\Support\Str;
use RuntimeException;

/** Keeps the working factor until its replacement is proved. Call under the identity lock. */
class TwoFactorEnrollment
{
    public function start(User $user, string $actor, string $method, string $phone, string $currentCode): array
    {
        if (($user->provider ?: 'email') !== 'email') throw new RuntimeException('Configure security with your sign-in provider.');
        if (! in_array($method, ['totp', 'sms', 'email'], true)) throw new RuntimeException('Choose a verification method.');
        $destination = $method === 'sms' ? preg_replace('/[\s().-]+/', '', $phone) : $user->email;
        if ($method === 'sms' && (! preg_match('/^\+[1-9]\d{7,14}$/', $destination) || ! app(TwoFactorDelivery::class)->smsAvailable())) {
            throw new RuntimeException('SMS is unavailable, or the phone number needs its country code (for example +44).');
        }
        if ($method === 'email' && ! $user->email_verified_at) throw new RuntimeException('Verify your account email before using email codes.');
        if (app(TwoFactor::class)->enabled($user) && ! app(TwoFactor::class)->check($user, $currentCode)) {
            throw new RuntimeException('Enter your current security code or a recovery code before changing methods.');
        }
        $id = (string) Str::uuid();
        $state = app(TwoFactorIdentity::class)->state($user);
        $secret = $method === 'totp' ? app(Totp::class)->secret() : null;
        $record = ['user' => $user->id, 'actor' => hash('sha256', $actor), 'state' => $state,
            'method' => $method, 'to' => Crypt::encryptString($destination),
            'secret' => $secret ? Crypt::encryptString($secret) : null, 'left' => 5,
            'expires' => now()->addMinutes(5)->timestamp];
        if ($method !== 'totp') app(TwoFactorCodes::class)->send('enroll:'.$id, $state, $method, $destination);
        // Only the newest setup for this account may finish; cancelling has no security effect.
        Cache::put($this->key($user), [...$record, 'id' => $id], now()->setTimestamp($record['expires']));
        return ['enrollmentId' => $id, 'method' => $method, 'account' => $destination,
            'secret' => $secret, 'uri' => $secret ? app(Totp::class)->uri($secret, $user->email, config('app.name') ?: 'Vibyra') : null];
    }

    public function resend(User $user, string $actor, string $id): bool
    {
        $record = Cache::get($this->key($user));
        if (! $this->valid($user, $actor, $id, $record) || $record['method'] === 'totp') return false;
        app(TwoFactorCodes::class)->send('enroll:'.$id, $record['state'], $record['method'], Crypt::decryptString($record['to']));
        return true;
    }

    private function valid(User $user, string $actor, string $id, mixed $record): bool
    {
        return is_array($record) && $record['id'] === $id && $record['left'] > 0
            && $record['expires'] > now()->timestamp && hash_equals($record['actor'], hash('sha256', $actor))
            && hash_equals($record['state'], app(TwoFactorIdentity::class)->state($user));
    }

    public function confirm(User $user, string $actor, string $id, string $code): ?array
    {
        $key = $this->key($user); $record = Cache::get($key);
        if (! $this->valid($user, $actor, $id, $record)) return null;
        $slot = $record['method'] === 'totp' ? app(Totp::class)->verify(Crypt::decryptString($record['secret']), $code) : null;
        $valid = $record['method'] === 'totp' ? $slot !== null
            : app(TwoFactorCodes::class)->check('enroll:'.$id, $record['state'], $code);
        if (! $valid) {
            $record['left']--;
            Cache::put($key, $record, now()->setTimestamp($record['expires']));
            return null;
        }
        $user->forceFill(['two_factor_method' => $record['method'], 'two_factor_destination' => $record['to'],
            'two_factor_secret' => $record['secret'], 'two_factor_confirmed_at' => now(),
            'two_factor_last_slot' => $slot, 'two_factor_revision' => (string) Str::uuid()])->save();
        $codes = app(TwoFactor::class)->replaceRecoveryCodes($user);
        Cache::forget($key);
        return $codes;
    }

    private function key(User $user): string { return 'two-factor:enrollment:'.$user->id; }
}
