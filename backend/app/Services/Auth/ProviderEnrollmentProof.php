<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/** One-use, session-bound provider identity proof for starting owner TOTP. */
class ProviderEnrollmentProof
{
    private const MINUTES = 5;

    public function issue(array $flow, string $provider, array $identity): string
    {
        $user = User::find((int) ($flow['accountId'] ?? 0));
        $expected = (string) ($flow['providerSubject'] ?? '');
        $subject = (string) ($identity['subject'] ?? '');
        if (! $user || $expected === '' || $subject === ''
            || ! hash_equals($expected, $subject)
            || ($user->provider ?: 'email') !== $provider
            || ! hash_equals($expected, (string) $user->provider_id)) {
            throw new ProviderIdentityException('The provider account does not match this Vibyra account.');
        }
        if (($flow['sessionType'] ?? null) !== 'web'
            || trim((string) ($flow['sessionId'] ?? '')) === '') {
            throw new ProviderIdentityException('The enrollment session is invalid.');
        }

        $proof = Str::random(64);
        Cache::put($this->key($proof), [
            'accountId' => $user->id,
            'provider' => $provider,
            'providerSubject' => $expected,
            'sessionType' => $flow['sessionType'],
            'sessionId' => (string) $flow['sessionId'],
        ], now()->addMinutes(self::MINUTES));

        return $proof;
    }

    public function claim(User $user, string $sessionType, string $sessionId, string $proof): bool
    {
        if (strlen($proof) !== 64) {
            return false;
        }
        $key = $this->key($proof);
        $held = Cache::lock($key.':claim-lock', 5)->block(2, fn () => Cache::pull($key));

        return is_array($held)
            && (int) ($held['accountId'] ?? 0) === (int) $user->id
            && ($held['sessionType'] ?? null) === $sessionType
            && hash_equals((string) ($held['sessionId'] ?? ''), $sessionId)
            && ($held['provider'] ?? null) === ($user->provider ?: 'email')
            && hash_equals((string) ($held['providerSubject'] ?? ''), (string) $user->provider_id);
    }

    private function key(string $proof): string
    {
        return 'provider-totp-enrollment:'.hash('sha256', $proof);
    }
}
