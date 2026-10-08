<?php
namespace App\Services\LiveStatus;

use Illuminate\Support\Facades\Http;

/**
 * One APNs HTTP/2 request per call, no retry: a card update is state, and a late replay could
 * show an old state over a newer one. Phones built with a development profile hold sandbox
 * tokens, so a token rejected by one host is tried once on the other and the answer kept.
 *
 * `sendAlert` is the ordinary notification path (push type `alert`, the bare bundle id as
 * topic). It is gated by phone notifications, not by the Live Activity flag.
 */
final class Apns
{
    public const HOSTS = ['production' => 'https://api.push.apple.com', 'sandbox' => 'https://api.sandbox.push.apple.com'];

    public function __construct(private readonly ApnsJwt $jwt) {}

    public function enabled(): bool
    {
        return (bool) config('live_status.enabled') && $this->jwt->configured();
    }

    public function alertsEnabled(): bool
    {
        return (bool) config('intelligence.push') && $this->jwt->configured();
    }

    /** @return array{status:int,reason:?string,host:string} */
    public function send(string $token, array $payload, int $priority, ?string $host): array
    {
        $first = $host === 'sandbox' ? 'sandbox' : 'production';
        $result = $this->post($first, $token, $payload, $this->headers('liveactivity', (string) config('live_status.topic'), $priority, '0'));
        if ($host === null && $result['status'] === 400 && $result['reason'] === 'BadDeviceToken') {
            $other = $first === 'production' ? 'sandbox' : 'production';
            $retry = $this->post($other, $token, $payload, $this->headers('liveactivity', (string) config('live_status.topic'), $priority, '0'));
            if ($retry['status'] === 200) return $retry;
        }
        return $result;
    }

    /**
     * An alert notification. `$host` is a hint (the remembered host, else the build's environment);
     * a BadDeviceToken answer is always tried once on the other host, so a dead token is one both
     * hosts refuse. A refused provider token is replaced and the send tried once more.
     *
     * @return array{status:int,reason:?string,host:string}
     */
    public function sendAlert(string $token, array $payload, int $priority, ?string $host, ?string $collapseId, int $ttl): array
    {
        $headers = $this->headers('alert', (string) config('live_status.alert_topic', 'app.vibyra.mobile'), $priority, (string) (time() + max(0, $ttl)));
        if ($collapseId !== null && $collapseId !== '') $headers['apns-collapse-id'] = substr($collapseId, 0, 64);
        $first = $host === 'sandbox' ? 'sandbox' : 'production';
        $result = $this->post($first, $token, $payload, $headers);
        if ($result['status'] === 403 && in_array($result['reason'], ['ExpiredProviderToken', 'InvalidProviderToken'], true)) {
            $result = $this->post($first, $token, $payload, $headers);
        }
        if ($result['status'] === 400 && $result['reason'] === 'BadDeviceToken') {
            return $this->post($first === 'production' ? 'sandbox' : 'production', $token, $payload, $headers);
        }
        return $result;
    }

    private function headers(string $type, string $topic, int $priority, string $expiration): array
    {
        return ['apns-topic' => $topic, 'apns-push-type' => $type, 'apns-priority' => (string) $priority, 'apns-expiration' => $expiration];
    }

    /** @return array{status:int,reason:?string,host:string} */
    private function post(string $host, string $token, array $payload, array $headers): array
    {
        try {
            $response = Http::withOptions(['version' => 2.0])->withoutRedirecting()->timeout((int) config('live_status.apns.timeout', 10))
                ->withHeaders(['authorization' => 'bearer '.$this->jwt->token(), ...$headers])
                ->withBody(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'application/json')
                ->post(self::HOSTS[$host].'/3/device/'.$token);
        } catch (\Throwable) {
            return ['status' => 0, 'reason' => 'NoResponse', 'host' => $host];
        }
        if (in_array($response->json('reason'), ['ExpiredProviderToken', 'InvalidProviderToken'], true)) $this->jwt->forget();
        return ['status' => $response->status(), 'reason' => $response->json('reason'), 'host' => $host];
    }
}
