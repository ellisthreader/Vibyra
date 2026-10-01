<?php

namespace Tests\Support;

use App\Models\User;
use App\Services\Auth\{Totp, TwoFactor};

trait TwoFactorFixture
{
    private function protectedAccount(): array
    {
        $user = User::factory()->create(['provider' => 'email']);
        $factor = app(TwoFactor::class); $totp = app(Totp::class);
        $secret = $factor->start($user);
        $slot = intdiv(time(), Totp::PERIOD);
        $codes = $factor->confirm($user, $totp->at($totp->decode($secret), $slot));
        $this->assertIsArray($codes);
        return [$user->fresh(), $codes, $totp->at($totp->decode($secret), $slot + 1)];
    }
}
