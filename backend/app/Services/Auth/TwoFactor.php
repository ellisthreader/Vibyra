<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

/**
 * Two-factor authentication as the rest of the app sees it: start a setup, confirm
 * it with a code from the app, check a code at login, and turn it off again.
 *
 * Two rules are kept here rather than left to callers. A code is accepted once: the
 * slot it came from is recorded, and anything at or before that slot is refused, so
 * a code read over somebody's shoulder is already spent. And a recovery code is
 * consumed by use -- it is a key that works once, not a second password.
 */
class TwoFactor
{
    public const RECOVERY_CODES = 10;

    public function __construct(private readonly Totp $totp) {}

    public function enabled(User $user): bool
    {
        return $user->two_factor_confirmed_at !== null && $this->secret($user) !== null;
    }

    /** A setup waiting for its first code. Starting again replaces it. */
    public function start(User $user): string
    {
        $secret = $this->totp->secret();
        $user->forceFill([
            'two_factor_secret' => Crypt::encryptString($secret),
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
            'two_factor_last_slot' => null,
        ])->save();

        return $secret;
    }

    /** The link the authenticator app is handed, for this account's pending setup. */
    public function setupUri(User $user, string $secret): string
    {
        $issuer = (string) (config('app.name') ?: 'Vibyra');

        return $this->totp->uri($secret, $user->email, $issuer);
    }

    /**
     * Turns a pending setup on, proving first that the app is showing codes this
     * server agrees with. Returns the recovery codes, the only time they are readable
     * in full anywhere but this account's own screen.
     *
     * @return list<string>|null Null when the code is wrong or there is nothing to confirm.
     */
    public function confirm(User $user, string $code): ?array
    {
        $secret = $this->secret($user);
        if ($secret === null || $user->two_factor_confirmed_at !== null) {
            return null;
        }
        $slot = $this->totp->verify($secret, $code);
        if ($slot === null) {
            return null;
        }
        $codes = $this->makeRecoveryCodes();
        $user->forceFill([
            'two_factor_recovery_codes' => Crypt::encryptString(json_encode($codes)),
            'two_factor_confirmed_at' => now(),
            'two_factor_last_slot' => $slot,
        ])->save();

        return $codes;
    }

    /**
     * A code at login: the app's six digits, or one recovery code, which is spent.
     * Everything else -- a repeat of a code already used, a code for an account with
     * no second factor -- is false, and the caller says nothing about which.
     */
    public function check(User $user, string $code): bool
    {
        if (! $this->enabled($user)) {
            return false;
        }
        $slot = $this->totp->verify((string) $this->secret($user), $code);
        if ($slot !== null) {
            if ($user->two_factor_last_slot !== null && $slot <= (int) $user->two_factor_last_slot) {
                return false;
            }
            $user->forceFill(['two_factor_last_slot' => $slot])->save();

            return true;
        }

        return $this->spendRecoveryCode($user, $code);
    }

    /** What is left of the recovery codes, readable only by the account itself. */
    public function recoveryCodes(User $user): array
    {
        $stored = (string) ($user->two_factor_recovery_codes ?? '');
        if ($stored === '') {
            return [];
        }
        try {
            $codes = json_decode(Crypt::decryptString($stored), true);
        } catch (DecryptException) {
            return [];
        }

        return is_array($codes) ? array_values(array_filter($codes, 'is_string')) : [];
    }

    /** A fresh set, which retires every code the old set still had. */
    public function replaceRecoveryCodes(User $user): array
    {
        $codes = $this->makeRecoveryCodes();
        $user->forceFill(['two_factor_recovery_codes' => Crypt::encryptString(json_encode($codes))])->save();

        return $codes;
    }

    public function disable(User $user): void
    {
        $user->forceFill([
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
            'two_factor_last_slot' => null,
        ])->save();
    }

    private function spendRecoveryCode(User $user, string $code): bool
    {
        $given = strtolower(trim($code));
        $left = [];
        $used = false;
        foreach ($this->recoveryCodes($user) as $stored) {
            if (! $used && hash_equals(strtolower($stored), $given)) {
                $used = true;

                continue;
            }
            $left[] = $stored;
        }
        if (! $used) {
            return false;
        }
        $user->forceFill(['two_factor_recovery_codes' => Crypt::encryptString(json_encode($left))])->save();

        return true;
    }

    /** @return list<string> */
    private function makeRecoveryCodes(): array
    {
        // Two short groups rather than one long string: easier to read off paper, and
        // the dash tells somebody looking at it that it is not one of the six digits.
        // The alphabet leaves out every pair that is read wrong when handwritten --
        // 0 and o, 1 and l -- because these are used exactly when nothing else works.
        return array_map(fn () => $this->recoveryCode(), range(1, self::RECOVERY_CODES));
    }

    private function recoveryCode(): string
    {
        $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
        $code = '';
        for ($at = 0; $at < 10; $at++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return substr($code, 0, 5) . '-' . substr($code, 5);
    }

    private function secret(User $user): ?string
    {
        $stored = (string) ($user->two_factor_secret ?? '');
        if ($stored === '') {
            return null;
        }
        try {
            return Crypt::decryptString($stored);
        } catch (DecryptException) {
            return null;
        }
    }
}
