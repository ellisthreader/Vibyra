<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Support\Str;

/**
 * The short gap between a correct password and a session, for an account that asks
 * for a code as well. The password is already spent by then, so what stands in for
 * it is this: a random handle, five minutes, five attempts, and nothing about the
 * account in the handle itself.
 *
 * It lives in the cache rather than a table because it is meant to expire and be
 * forgotten. A challenge that cannot be found reads exactly like one that was wrong,
 * so a stolen handle tells its holder nothing they did not already have.
 */
class TwoFactorChallenge
{
    public const MINUTES = 5;
    private const ATTEMPTS = 5;

    public function issue(User $user): array
    {
        $id = (string) Str::uuid();
        $expires = now()->addMinutes(self::MINUTES);
        Cache::put($this->key($id), ['user' => $user->id, 'left' => self::ATTEMPTS,
            'expires' => $expires->timestamp, 'state' => $this->state($user)], $expires);

        try { $delivery = $this->delivery($id, true); }
        catch (\RuntimeException) { $delivery = [...app(TwoFactorIdentity::class)->describe($user), 'codeSent' => false]; }
        return ['challengeId' => $id, 'expiresIn' => self::MINUTES * 60, ...($delivery ?? [])];
    }

    /**
     * The account behind a challenge, once, when the code is right. A wrong code
     * costs one of the attempts; running out ends the challenge rather than the
     * account, so somebody guessing has to have the password again to try more.
     */
    public function claim(string $id, string $code): ?User
    {
        $key = $this->key($id);
        $held = Cache::get($key);
        if (! is_array($held) || ! is_int($held['user'] ?? null)) return null;
        // The database user lock serializes cache consumption across workers.
        // Re-read inside it: a cache lock lease could expire while waiting on SQL.
        return DB::transaction(function () use ($held, $key, $code): ?User {
            $user = User::whereKey($held['user'])->lockForUpdate()->first();
            $current = Cache::get($key);
            if (! $user || ! is_array($current) || ($current['user'] ?? null) !== $user->id) return null;
            if (! is_int($current['expires'] ?? null) || $current['expires'] <= now()->timestamp
                || ! is_string($current['state'] ?? null) || ! hash_equals($this->state($user), $current['state'])) {
                Cache::forget($key);
                return null;
            }
            $delivered = in_array($user->two_factor_method, ['sms', 'email'], true)
                && app(TwoFactorCodes::class)->check('login:'.$key, $current['state'], $code);
            if (! $delivered && ! app(TwoFactor::class)->check($user, $code, false)) {
                $left = (int) ($current['left'] ?? 0) - 1;
                if ($left > 0) Cache::put($key, [...$current, 'left' => $left], now()->setTimestamp($current['expires']));
                else Cache::forget($key);
                return null;
            }
            Cache::forget($key);
            return $user;
        }, 3);
    }

    /** A password-half proof must not survive password, setup or recovery changes. */
    private function state(User $user): string
    {
        return app(TwoFactorIdentity::class)->state($user);
    }

    public function delivery(string $id, bool $send): ?array
    {
        $key = $this->key($id); $held = Cache::get($key);
        if (! is_array($held) || ! is_int($held['user'] ?? null)) return null;
        return DB::transaction(function () use ($held, $key, $send) {
            $user = User::whereKey($held['user'])->lockForUpdate()->first();
            $current = Cache::get($key);
            if (! $user || ! is_array($current) || ($current['left'] ?? 0) <= 0
                || $current['expires'] <= now()->timestamp || ! hash_equals($this->state($user), $current['state'])) return null;
            $identity = app(TwoFactorIdentity::class);
            if ($send && in_array($user->two_factor_method, ['sms', 'email'], true)) {
                app(TwoFactorCodes::class)->send('login:'.$key, $current['state'],
                    $user->two_factor_method, $identity->destination($user) ?? '');
            }
            return [...$identity->describe($user), 'codeSent' => app(TwoFactorCodes::class)->sent('login:'.$key, $current['state'])];
        });
    }

    private function key(string $id): string
    {
        return 'two-factor:challenge:' . hash('sha256', $id);
    }
}
