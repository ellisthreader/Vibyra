<?php

namespace App\Services\Vibes;

/** Sandbox access is an explicit server-side account setting, never a phone claim. */
final class AppleEnvironment
{
    public function tester(int $userId): bool
    {
        return in_array((string) $userId, array_map('strval', config('vibes.apple_sandbox_user_ids', [])), true);
    }

    public function forUser(int $userId): string
    {
        return $this->tester($userId) ? 'Sandbox' : config('vibes.apple_environment');
    }

    public function allows(int $userId, string $environment): bool
    {
        return $environment === config('vibes.apple_environment')
            || ($environment === 'Sandbox' && $this->tester($userId));
    }

    public function notifications(string $hint): string
    {
        return $hint === 'Sandbox' && config('vibes.apple_sandbox_user_ids', [])
            ? 'Sandbox' : config('vibes.apple_environment');
    }

    public function purchasesEnabled(int $userId): bool
    {
        return config('legal.paid_sales_enabled', false) && config('membership.enabled')
            && (config('membership.apple_enabled') || $this->tester($userId))
            && config('vibes.apple_private_key') && config('vibes.apple_issuer') && config('vibes.apple_key_id');
    }
}
