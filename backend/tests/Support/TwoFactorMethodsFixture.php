<?php

namespace Tests\Support;

use App\Models\User;
use App\Notifications\VibyraSecurityCode;
use Illuminate\Support\Facades\{Http, Notification};

trait TwoFactorMethodsFixture
{
    private bool $smsFailure = false;
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'services.twilio_sms.account_sid' => 'AC'.str_repeat('a', 32),
            'services.twilio_sms.from' => '+447700900100', 'services.twilio_sms.api_key' => 'SK'.str_repeat('b', 32),
            'services.twilio_sms.api_secret' => 'synthetic-secret']);
        Notification::fake();
        Http::preventStrayRequests(); Http::fake(['api.twilio.com/*' => fn () => Http::response([
            'status' => $this->smsFailure ? 'failed' : 'queued', 'sid' => 'SM'.str_repeat('c', 32)], $this->smsFailure ? 400 : 201)]);
    }

    private function account(): array
    {
        $token = $this->postJson('/api/auth/signup', ['email' => 'methods@example.com', 'password' => 'secret123'])->assertCreated()->json('token');
        $user = User::where('email', 'methods@example.com')->firstOrFail();
        $user->forceFill(['email_verified_at' => now()])->save();
        return [$user, $token, ['Authorization' => 'Bearer '.$token]];
    }

    private function sentCode(string $method): string
    {
        if ($method === 'email') return Notification::sent(new \Illuminate\Notifications\AnonymousNotifiable, VibyraSecurityCode::class)->last()->code;
        $request = Http::recorded(fn ($r) => str_contains($r->url(), 'api.twilio.com'))->last()[0];
        preg_match('/code is (\d{6})/', $request['Body'], $matches);
        return $matches[1];
    }

    private function enroll(string $method): array
    {
        [$user, $token, $headers] = $this->account();
        $setup = $this->postJson('/api/account/2fa/method/start', ['method' => $method, 'phoneNumber' => '+447700900123'], $headers)->assertOk()->json();
        $codes = $this->postJson('/api/account/2fa/method/confirm', ['enrollmentId' => $setup['enrollmentId'], 'code' => $this->sentCode($method)], $headers)
            ->assertOk()->json('recoveryCodes');
        return [$user->fresh(), $token, $headers, $codes];
    }

    private function login(): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/auth/login', ['provider' => 'email', 'email' => 'methods@example.com', 'password' => 'secret123'])->assertOk();
    }
}
