<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VibyraPhoneVerificationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_verify_a_phone_number_with_twilio_verify(): void
    {
        $this->configureVerify();
        Http::fake([
            'https://verify.twilio.com/*/Verifications' => Http::response(['status' => 'pending']),
            'https://verify.twilio.com/*/VerificationCheck' => Http::response([
                'status' => 'approved',
                'valid' => true,
            ]),
        ]);
        $token = $this->signupToken('phone@example.com');

        $this->withToken($token)->postJson('/api/account/phone/start', [
            'phoneNumber' => '+44 7700 900123',
        ])->assertOk()->assertJsonPath('pendingPhoneNumber', '+447700900123');

        $this->withToken($token)->postJson('/api/account/phone/check', [
            'code' => '123456',
        ])->assertOk()
            ->assertJsonPath('user.phoneNumber', '+447700900123')
            ->assertJsonPath('user.phoneVerified', true);

        $user = User::where('email', 'phone@example.com')->firstOrFail();
        $this->assertSame('+447700900123', $user->phone_number);
        $this->assertNotNull($user->phone_verified_at);
        $this->assertNull($user->pending_phone_number);
    }

    public function test_phone_verification_rejects_invalid_numbers_and_codes(): void
    {
        $this->configureVerify();
        Http::fake([
            'https://verify.twilio.com/*/Verifications' => Http::response(['status' => 'pending']),
            'https://verify.twilio.com/*/VerificationCheck' => Http::response([
                'status' => 'pending',
                'valid' => false,
            ], 404),
        ]);
        $token = $this->signupToken('invalid-phone@example.com');

        $this->withToken($token)->postJson('/api/account/phone/start', [
            'phoneNumber' => '07700900123',
        ])->assertUnprocessable();
        $this->withToken($token)->postJson('/api/account/phone/start', [
            'phoneNumber' => '+447700900123',
        ])->assertOk();
        $this->withToken($token)->postJson('/api/account/phone/check', [
            'code' => '000000',
        ])->assertUnprocessable();
    }

    private function configureVerify(): void
    {
        config()->set('services.twilio_verify', [
            'service_sid' => 'VA'.str_repeat('a', 32),
            'api_key' => 'SK'.str_repeat('b', 32),
            'api_secret' => 'test-secret',
        ]);
    }

    private function signupToken(string $email): string
    {
        return (string) $this->postJson('/api/auth/signup', [
            'name' => 'Phone User',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');
    }
}
