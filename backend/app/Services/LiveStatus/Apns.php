<?php
namespace App\Services\LiveStatus;

use Illuminate\Support\Facades\Http;

/**
 * One APNs HTTP/2 request per call, no retry: a card update is state, and a late replay could
 * show an old state over a newer one. Phones built with a development profile hold sandbox
 * tokens, so a token rejected by one host is tried once on the other and the answer kept.
 */
final class Apns
{
    public const HOSTS = ['production' => 'https://api.push.apple.com', 'sandbox' => 'https://api.sandbox.push.apple.com'];

    public function __construct(private readonly ApnsJwt $jwt) {}

    public function enabled(): bool
    {
        return (bool) config('live_status.enabled') && $this->jwt->configured();
    }

    /** @return array{status:int,reason:?string,host:string} */
    public function send(string $token, array $payload, int $priority, ?string $host): array
    {
        $first = $host === 'sandbox' ? 'sandbox' : 'production';
        $result = $this->post($first, $token, $payload, $priority);
        if ($host === null && $result['status'] === 400 && $result['reason'] === 'BadDeviceToken') {
            $other = $first === 'production' ? 'sandbox' : 'production';
            $retry = $this->post($other, $token, $payload, $priority);
            if ($retry['status'] === 200) return $retry;
        }
        return $result;
    }

    /** @return array{status:int,reason:?string,host:string} */
    private function post(string $host, string $token, array $payload, int $priority): array
    {
        try {
            $response = Http::withOptions(['version' => 2.0])->timeout((int) config('live_status.apns.timeout', 10))
                ->withHeaders([
                    'authorization' => 'bearer '.$this->jwt->token(),
                    'apns-topic' => (string) config('live_status.topic'),
                    'apns-push-type' => 'liveactivity',
                    'apns-priority' => (string) $priority,
                    'apns-expiration' => '0',
                ])->withBody(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'application/json')
                ->post(self::HOSTS[$host].'/3/device/'.$token);
        } catch (\Throwable) {
            return ['status' => 0, 'reason' => 'NoResponse', 'host' => $host];
        }
        if (in_array($response->json('reason'), ['ExpiredProviderToken', 'InvalidProviderToken'], true)) $this->jwt->forget();
        return ['status' => $response->status(), 'reason' => $response->json('reason'), 'host' => $host];
    }
}
