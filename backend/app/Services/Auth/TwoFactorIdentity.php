<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Crypt;

/** Binds pending proofs to the complete security configuration, including its destination. */
class TwoFactorIdentity
{
    public function state(User $user): string
    {
        return hash('sha256', json_encode([$user->password, $user->two_factor_secret,
            (string) $user->two_factor_confirmed_at, $user->two_factor_recovery_codes,
            $user->two_factor_method, $user->two_factor_destination, $user->two_factor_revision,
            $user->email, (string) $user->email_verified_at], JSON_THROW_ON_ERROR));
    }

    public function destination(User $user): ?string
    {
        try {
            return $user->two_factor_destination ? Crypt::decryptString($user->two_factor_destination) : null;
        } catch (\Illuminate\Contracts\Encryption\DecryptException) {
            return null;
        }
    }

    public function describe(User $user): array
    {
        $method = $user->two_factor_method ?: 'totp';
        $to = $this->destination($user);
        $masked = $method === 'sms' && $to ? '••••'.substr($to, -4)
            : ($method === 'email' && $to ? substr($to, 0, 1).'•••@'.explode('@', $to)[1] : null);
        return ['method' => $method, 'destination' => $masked];
    }
}
