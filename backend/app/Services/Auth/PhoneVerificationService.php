<?php

namespace App\Services\Auth;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class PhoneVerificationService
{
    public function start(string $phoneNumber): void
    {
        $response = $this->request()->asForm()->post($this->serviceUrl('/Verifications'), [
            'To' => $phoneNumber,
            'Channel' => 'sms',
        ]);

        if (! $response->successful() || $response->json('status') !== 'pending') {
            throw new RuntimeException('Phone verification could not be started.');
        }
    }

    public function check(string $phoneNumber, string $code): bool
    {
        $response = $this->request()->asForm()->post($this->serviceUrl('/VerificationCheck'), [
            'To' => $phoneNumber,
            'Code' => $code,
        ]);

        return $response->successful()
            && $response->json('status') === 'approved'
            && $response->json('valid') === true;
    }

    private function request(): PendingRequest
    {
        $username = trim((string) config('services.twilio_verify.api_key'));
        $password = trim((string) config('services.twilio_verify.api_secret'));
        if ($username === '' || $password === '' || ! $this->serviceSid()) {
            throw new RuntimeException('Phone verification is not configured.');
        }

        return Http::acceptJson()->withBasicAuth($username, $password)->timeout(10);
    }

    private function serviceUrl(string $suffix): string
    {
        return 'https://verify.twilio.com/v2/Services/'.$this->serviceSid().$suffix;
    }

    private function serviceSid(): string
    {
        $sid = trim((string) config('services.twilio_verify.service_sid'));

        return preg_match('/^VA[0-9a-fA-F]{32}$/', $sid) ? $sid : '';
    }
}
