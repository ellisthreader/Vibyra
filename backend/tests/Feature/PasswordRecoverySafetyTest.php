<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\VibyraResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class PasswordRecoverySafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_recovery_has_the_same_public_receipt_for_password_provider_and_missing_accounts(): void
    {
        Notification::fake();
        $passwordUser = User::factory()->create(['provider' => 'email']);
        $appleUser = User::factory()->create(['provider' => 'apple']);
        $messages = [];
        foreach ([$passwordUser->email, $appleUser->email, 'missing@example.invalid'] as $email) {
            $messages[] = $this->postJson('/api/auth/password/forgot', ['email' => $email])
                ->assertOk()->assertJsonPath('ok', true)->assertJsonMissingPath('token')->json();
        }
        $this->assertSame($messages[0], $messages[1]);
        $this->assertSame($messages[0], $messages[2]);
        Notification::assertSentToTimes($passwordUser, VibyraResetPassword::class, 1);
        Notification::assertNotSentTo($appleUser, VibyraResetPassword::class);
        $this->assertGuest();
    }

    public function test_emailed_link_token_changes_password_once_and_never_signs_the_browser_in(): void
    {
        Notification::fake();
        $user = User::factory()->create(['provider' => 'email', 'password' => 'original-secret']);
        $this->postJson('/api/auth/password/forgot', ['email' => $user->email])->assertOk();
        $notification = Notification::sent($user, VibyraResetPassword::class)->sole();
        parse_str(parse_url($notification->toMail($user)->actionUrl, PHP_URL_QUERY), $fields);
        $this->assertSame($user->email, $fields['email']);
        $fields += ['password' => 'replacement-secret', 'passwordConfirmation' => 'replacement-secret'];
        $this->postJson('/web-api/auth/password/reset', $fields)->assertOk()->assertJsonMissingPath('token');
        $this->assertTrue(Hash::check('replacement-secret', $user->fresh()->password));
        $this->assertGuest();
        $this->postJson('/web-api/auth/password/reset', [...$fields,
            'password' => 'another-password', 'passwordConfirmation' => 'another-password'])
            ->assertUnprocessable();
        $this->assertTrue(Hash::check('replacement-secret', $user->fresh()->password));
    }

    public function test_invalid_expired_and_wrong_account_links_do_not_change_passwords(): void
    {
        $user = User::factory()->create(['provider' => 'email', 'password' => 'original-secret']);
        $other = User::factory()->create(['provider' => 'email', 'password' => 'other-secret']);
        $token = Password::broker()->createToken($user);
        $fields = ['email' => $user->email, 'token' => $token,
            'password' => 'replacement-secret', 'passwordConfirmation' => 'replacement-secret'];
        $this->postJson('/web-api/auth/password/reset', [...$fields, 'token' => 'invalid-token'])->assertUnprocessable();
        $this->postJson('/web-api/auth/password/reset', [...$fields, 'email' => $other->email])->assertUnprocessable();
        $broker = config('auth.defaults.passwords');
        DB::table(config("auth.passwords.{$broker}.table"))->where('email', $user->email)
            ->update(['created_at' => now()->subMinutes((int) config("auth.passwords.{$broker}.expire") + 1)]);
        $this->postJson('/web-api/auth/password/reset', $fields)->assertUnprocessable();
        $this->assertTrue(Hash::check('original-secret', $user->fresh()->password));
        $this->assertTrue(Hash::check('other-secret', $other->fresh()->password));
        $this->assertGuest();
    }

    public function test_provider_accounts_cannot_gain_a_password_through_a_reset_token(): void
    {
        $user = User::factory()->create(['provider' => 'apple', 'password' => 'unused-provider-secret']);
        $token = Password::broker()->createToken($user);
        $this->postJson('/web-api/auth/password/reset', ['email' => $user->email, 'token' => $token,
            'password' => 'replacement-secret', 'passwordConfirmation' => 'replacement-secret'])->assertUnprocessable();
        $this->assertTrue(Hash::check('unused-provider-secret', $user->fresh()->password));
        $this->assertGuest();
    }
}
