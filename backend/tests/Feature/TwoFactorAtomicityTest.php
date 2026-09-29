<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\{TwoFactor, TwoFactorChallenge};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB};
use Tests\TestCase;

class TwoFactorAtomicityTest extends TestCase
{
    use RefreshDatabase, \Tests\Support\TwoFactorFixture;

    public function test_stale_snapshots_cannot_replay_a_totp_slot_or_recovery_code(): void
    {
        [$user, $codes, $totp] = $this->protectedAccount();
        foreach ([$totp, $codes[0]] as $code) {
            $first = $user->fresh(); $stale = $user->fresh();
            $this->assertTrue(app(TwoFactor::class)->check($first, $code));
            $this->assertFalse(app(TwoFactor::class)->check($stale, $code));
            $this->assertSame($first->two_factor_recovery_codes, $user->fresh()->two_factor_recovery_codes);
            $this->assertSame($first->two_factor_last_slot, $user->fresh()->two_factor_last_slot);
        }
    }

    public function test_stale_login_cannot_restore_codes_after_replacement_or_disabled_two_factor(): void
    {
        [$user, $old] = $this->protectedAccount();
        $stale = $user->fresh();
        $new = app(TwoFactor::class)->replaceRecoveryCodes($user);
        $this->assertFalse(app(TwoFactor::class)->check($stale, $old[0]));
        $this->assertSame($new, app(TwoFactor::class)->recoveryCodes($user->fresh()));
        $stale = $user->fresh(); app(TwoFactor::class)->disable($user);
        $this->assertFalse(app(TwoFactor::class)->check($stale, $new[0]));
        $this->assertFalse(app(TwoFactor::class)->enabled($user->fresh()));
    }

    public function test_rolled_back_code_consumption_does_not_leave_stale_model_authority(): void
    {
        [$user, $codes] = $this->protectedAccount();
        try {
            DB::transaction(function () use ($user, $codes) {
                $this->assertTrue(app(TwoFactor::class)->check($user, $codes[0]));
                throw new \RuntimeException('rollback fixture');
            });
            $this->fail('Fixture must roll back');
        } catch (\RuntimeException $error) { $this->assertSame('rollback fixture', $error->getMessage()); }
        $this->assertCount(10, app(TwoFactor::class)->recoveryCodes($user->fresh()));
        $this->assertTrue(app(TwoFactor::class)->check($user, $codes[0]));
        $this->assertCount(9, app(TwoFactor::class)->recoveryCodes($user));
    }

    public function test_a_challenge_is_consumed_once_even_with_two_distinct_valid_codes(): void
    {
        [$user, $codes] = $this->protectedAccount(); $service = app(TwoFactorChallenge::class);
        $id = $service->issue($user)['challengeId'];
        $this->assertNotNull($service->claim($id, $codes[0]));
        $this->assertNull($service->claim($id, $codes[1]));
        $this->assertContains($codes[1], app(TwoFactor::class)->recoveryCodes($user->fresh()));
    }

    public function test_failed_guesses_do_not_extend_the_original_challenge_expiry(): void
    {
        [$user, , $totp] = $this->protectedAccount(); $service = app(TwoFactorChallenge::class);
        $id = $service->issue($user)['challengeId'];
        $this->travel(4)->minutes(); $this->assertNull($service->claim($id, 'invalid'));
        $this->travel(61)->seconds(); $this->assertNull($service->claim($id, $totp));
        $this->assertNull(Cache::get('two-factor:challenge:'.hash('sha256', $id)));
    }

    public function test_pending_password_proof_is_invalid_after_password_or_recovery_change(): void
    {
        foreach (['password', 'recovery'] as $change) {
            [$user, $codes] = $this->protectedAccount(); $service = app(TwoFactorChallenge::class);
            $id = $service->issue($user)['challengeId'];
            if ($change === 'password') $user->forceFill(['password' => 'changed-fixture-password'])->save();
            else $codes = app(TwoFactor::class)->replaceRecoveryCodes($user);
            $this->assertNull($service->claim($id, $codes[0]));
            $this->assertCount(10, app(TwoFactor::class)->recoveryCodes($user->fresh()));
        }
    }
}
