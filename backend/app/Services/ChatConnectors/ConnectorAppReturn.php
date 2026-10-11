<?php

namespace App\Services\ChatConnectors;

use Illuminate\Support\Facades\{Cache, Crypt};

/** Browser-only proof: polling the initiating account can never collect a forwarded sign-in. */
final class ConnectorAppReturn
{
    public static function options(?string $returnUrl, ?string $protocol): array
    {
        if ($protocol !== 'loopback-v1') return [];
        abort_unless(self::validReturn($returnUrl), 422, 'Invalid app return address.');
        return ['appReturnCode' => bin2hex(random_bytes(32))];
    }

    public static function validReturn(?string $url): bool
    {
        if (!is_string($url) || !preg_match('#\Ahttp://127\.0\.0\.1:([0-9]{4,5})/integrations/connected/[a-f0-9]{64}\z#', $url, $m)) return false;
        return (int) $m[1] >= 1024 && (int) $m[1] <= 65535;
    }

    public static function enabled(array $flow): bool
    {
        return is_string($flow['appReturnCode'] ?? null) && preg_match('/\A[a-f0-9]{64}\z/', $flow['appReturnCode']) === 1;
    }

    /** Credentials stay encrypted and unusable until the originating app presents the browser's proof. */
    public function hold(array $flow, array $grant): void
    {
        Cache::put($this->key($flow['flowId']), Crypt::encryptString(json_encode([
            'flow' => $flow, 'grant' => $grant, 'heldAt' => now()->timestamp,
        ], JSON_THROW_ON_ERROR)), now()->addMinutes(OAuthFlows::MINUTES));
    }

    public function claim(string $id, int $userId, string $code): array
    {
        return Cache::lock($this->key($id).':lock', 30)->block(5, function () use ($id, $userId, $code) {
            $stored = Cache::get($this->key($id));
            abort_unless(is_string($stored), 404, 'This sign-in is not awaiting completion.');
            $pending = json_decode(Crypt::decryptString($stored), true, flags: JSON_THROW_ON_ERROR);
            $flow = $pending['flow'];
            abort_unless((int) $flow['userId'] === $userId && hash_equals($flow['appReturnCode'], $code), 404, 'This sign-in is not awaiting completion.');
            abort_unless(config('chat_connectors.enabled'), 503, 'Integrations are switched off right now.');
            Cache::forget($this->key($id));
            $grant = $pending['grant'];
            if (is_int($grant['expires_in'] ?? null)) $grant['expires_in'] = max(0, $grant['expires_in'] - max(0, now()->timestamp - $pending['heldAt']));
            $this->save($flow, $grant);
            return app(OAuthFlows::class)->status($id, $userId);
        });
    }

    public function save(array $flow, array $grant): void
    {
        $flows = app(OAuthFlows::class);
        try {
            if (in_array($flow['mode'] ?? 'install', ['add_account', 'channel_owner', 'channel_bot'], true)) {
                $row = app(\App\Services\AgentRuns\Connections\Connections::class)
                    ->addAccount((int) $flow['userId'], $flow['slug'], $grant['access'], $grant);
                $flows->succeed($flow, ['connectionId' => $row->id]);
            } else {
                app(Installs::class)->connect((int) $flow['userId'], $flow['slug'], $grant['access'], $grant);
                $flows->succeed($flow);
            }
        } catch (\Throwable $e) {
            $flows->fail($flow, 'The connection could not be saved. Please try again.');
        }
    }

    private function key(string $id): string { return 'chat-connectors:app-return:'.$id; }
}
