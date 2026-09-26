<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
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
        Cache::put($this->key($id), ['user' => $user->id, 'left' => self::ATTEMPTS], now()->addMinutes(self::MINUTES));

        return ['challengeId' => $id, 'expiresIn' => self::MINUTES * 60];
    }

    /**
     * The account behind a challenge, once, when the code is right. A wrong code
     * costs one of the attempts; running out ends the challenge rather than the
     * account, so somebody guessing has to have the password again to try more.
     */
    public function claim(string $id, string $code): ?User
    {
        $held = Cache::get($this->key($id));
        if (! is_array($held)) {
            return null;
        }
        $user = User::find($held['user'] ?? null);
        if (! $user || ! app(TwoFactor::class)->check($user, $code)) {
            $left = (int) ($held['left'] ?? 0) - 1;
            if ($left > 0) {
                Cache::put($this->key($id), ['user' => $held['user'] ?? null, 'left' => $left], now()->addMinutes(self::MINUTES));
            } else {
                Cache::forget($this->key($id));
            }

            return null;
        }
        Cache::forget($this->key($id));

        return $user;
    }

    private function key(string $id): string
    {
        return 'two-factor:challenge:' . hash('sha256', $id);
    }
}
