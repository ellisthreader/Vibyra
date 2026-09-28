<?php

namespace App\Services\Vibes;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Apple DeviceCheck: two bits of storage per physical device that Apple keeps,
 * not us. They survive deleting and reinstalling the app, restoring from backup
 * and clearing every byte the app owns, which is exactly what is needed to answer
 * "has this device already had its free Vibes?".
 *
 * We use bit0 for that and leave bit1 alone. Nothing here identifies a person: a
 * device token is single-use, opaque, and is never stored — only Apple can map it
 * back to hardware, and only within our own team's namespace.
 *
 * The failure posture is deliberately closed. If DeviceCheck is configured and
 * cannot answer, `alreadyGranted` reports true and the guest is created with no
 * Vibes rather than with a grant we could not account for. An outage costs new
 * guests their trial credit for its duration; the opposite choice costs real money
 * for as long as nobody notices.
 */
class DeviceCheck
{
    public function configured(): bool
    {
        return (bool) (config('vibes.devicecheck_private_key') && config('vibes.devicecheck_key_id')
            && config('vibes.devicecheck_team_id'));
    }

    /** True when this device has been granted guest Vibes before, or cannot be asked. */
    public function alreadyGranted(string $deviceToken): bool
    {
        if (!$this->configured()) return false;
        $response = $this->post('query_two_bits', $deviceToken);
        if ($response === null) return true;
        // A device Apple has no bits for answers 200 with a plain-text explanation
        // rather than JSON. That is the ordinary "never seen before" case.
        $body = $response['body'];
        if (str_contains($body, 'Failed to find bit state')) return false;
        $data = json_decode($body, true);
        if (!is_array($data)) return true;
        return (bool) ($data['bit0'] ?? true);
    }

    /** Records that this device has had its guest Vibes. Never throws. */
    public function markGranted(string $deviceToken): bool
    {
        if (!$this->configured()) return false;
        return $this->post('update_two_bits', $deviceToken, ['bit0' => true, 'bit1' => false]) !== null;
    }

    /** @return array{body: string}|null Null on any failure to reach or satisfy Apple. */
    private function post(string $path, string $deviceToken, array $extra = []): ?array
    {
        $host = config('vibes.devicecheck_environment') === 'development'
            ? 'https://api.development.devicecheck.apple.com' : 'https://api.devicecheck.apple.com';
        try {
            $response = Http::withToken($this->token())->acceptJson()->timeout(10)
                ->post($host.'/v1/'.$path, [
                    'device_token' => $deviceToken,
                    'transaction_id' => (string) Str::uuid(),
                    'timestamp' => (int) (microtime(true) * 1000),
                    ...$extra,
                ]);
        } catch (\Throwable) {
            return null;
        }
        return $response->successful() ? ['body' => $response->body()] : null;
    }

    private function token(): string
    {
        return app(AppleJwt::class)->sign((string) config('vibes.devicecheck_private_key'),
            (string) config('vibes.devicecheck_key_id'),
            ['iss' => config('vibes.devicecheck_team_id'), 'iat' => time()]);
    }
}
