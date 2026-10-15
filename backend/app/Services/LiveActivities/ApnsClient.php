<?php
namespace App\Services\LiveActivities;

use Illuminate\Support\Facades\Http;

/**
 * One APNs HTTP/2 request per call, no retry. A Live Activity write is state, not a
 * message: replaying it late can show an old phase over a newer one, so a failure is
 * reported to the caller and the next transition simply sends the then-current state.
 */
final class ApnsClient
{
    public function __construct(private readonly ApnsJwt $jwt) {}

    public function enabled(): bool
    {
        return (bool) config('live_activities.enabled') && $this->jwt->configured();
    }

    public function baseUrl(): string
    {
        $configured = (string) config('live_activities.apns.base_url');
        if ($configured !== '') return rtrim($configured, '/');
        return config('intelligence.environment') === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    }

    /**
     * @return array{status:int,reason:?string,apnsId:?string} status 0 means the request never got an answer
     */
    public function send(string $deviceToken, array $payload, int $priority, int $expiration = 0): array
    {
        try {
            $response = Http::withOptions(['version' => 2.0])->timeout((int) config('live_activities.apns.timeout', 10))
                ->withHeaders([
                    'authorization' => 'bearer '.$this->jwt->token(),
                    'apns-topic' => (string) config('live_activities.topic'),
                    'apns-push-type' => 'liveactivity',
                    'apns-priority' => (string) $priority,
                    'apns-expiration' => (string) $expiration,
                ])->withBody(json_encode($payload, JSON_UNESCAPED_SLASHES), 'application/json')
                ->post($this->baseUrl().'/3/device/'.$deviceToken);
        } catch (\Throwable) {
            return ['status' => 0, 'reason' => 'NoResponse', 'apnsId' => null];
        }
        // An expired or rejected provider token is replaced on the next send.
        if (in_array($response->json('reason'), ['ExpiredProviderToken', 'InvalidProviderToken'], true)) $this->jwt->forget();
        return ['status' => $response->status(), 'reason' => $response->json('reason'), 'apnsId' => $response->header('apns-id') ?: null];
    }
}
