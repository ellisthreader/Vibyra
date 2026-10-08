<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class WebsiteRecoveryValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_rejects_structured_email_without_sending_mail(): void
    {
        Notification::fake();
        $this->postJson('/web-api/auth/password/forgot', ['email' => ['member@example.test']])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        Notification::assertNothingSent();
    }

    public function test_reset_rejects_structured_fields_without_changing_password(): void
    {
        $user = User::factory()->create(['provider' => 'email', 'password' => 'original-secret']);
        $fields = ['email' => $user->email, 'token' => 'reset-token',
            'password' => 'replacement-secret', 'passwordConfirmation' => 'replacement-secret'];
        foreach (array_keys($fields) as $field) {
            $this->postJson('/web-api/auth/password/reset', [...$fields, $field => ['invalid']])
                ->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertTrue(Hash::check('original-secret', $user->fresh()->password));
        $this->assertGuest();
    }
}
