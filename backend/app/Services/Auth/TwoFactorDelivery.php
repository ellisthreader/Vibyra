<?php

namespace App\Services\Auth;

use App\Notifications\VibyraSecurityCode;
use Illuminate\Support\Facades\{Http, Notification};
use RuntimeException;

/** SMS uses the configured Twilio sender. No provider retry can send a second message implicitly. */
class TwoFactorDelivery
{
    public function smsAvailable(): bool
    {
        return preg_match('/^AC[0-9a-fA-F]{32}$/', (string) config('services.twilio_sms.account_sid'))
            && preg_match('/^\+[1-9]\d{7,14}$/', (string) config('services.twilio_sms.from'))
            && ((config('services.twilio_sms.api_key') && config('services.twilio_sms.api_secret'))
                || config('services.twilio_sms.auth_token'));
    }

    public function send(string $method, string $destination, string $code): void
    {
        if ($method === 'email') {
            Notification::route('mail', $destination)->notify(new VibyraSecurityCode($code));
            return;
        }
        if ($method !== 'sms' || ! $this->smsAvailable()) throw new RuntimeException('SMS is not configured.');
        $key = config('services.twilio_sms.api_key');
        $secret = config('services.twilio_sms.api_secret');
        $useKey = $key && $secret;
        $response = Http::acceptJson()->asForm()->withBasicAuth(
            $useKey ? $key : config('services.twilio_sms.account_sid'),
            $useKey ? $secret : config('services.twilio_sms.auth_token'),
        )->timeout(10)->post('https://api.twilio.com/2010-04-01/Accounts/'.config('services.twilio_sms.account_sid').'/Messages.json', [
            'From' => config('services.twilio_sms.from'), 'To' => $destination,
            'Body' => 'Your Vibyra security code is '.$code.'. Expires in 5 minutes. Never share this code.',
        ]);
        if (! $response->successful() || ! in_array($response->json('status'), ['queued', 'accepted', 'sending', 'sent', 'delivered'], true)) {
            throw new RuntimeException('The SMS provider could not send this code.');
        }
    }
}
