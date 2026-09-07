<?php

namespace App\Services\Integrations;

use App\Models\IntegrationConnection as Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Connections
{
    public function save(int $user, array $p, array $tokens, array $flow): Connection
    {
        $reader = app(ProviderRead::class);
        $identity = $reader->identity($p, $tokens, $flow);
        $credentials = array_intersect_key($tokens, array_flip(['access_token', 'refresh_token', 'scope']));
        if ($p['provider'] === 'shopify') {
            $credentials['shop'] = $flow['shop'];
        }
        $reader->read($p['service'], $credentials); // Identity alone is not a working connection.
        $environment = $p['provider'] === 'stripe' ? (($tokens['livemode'] ?? false) ? 'live' : 'test') : 'live';
        if ($p['provider'] === 'stripe') {
            abort_unless($environment === ($p['settings']['mode'] ?? 'test'), 409, 'Stripe environment mismatch.');
        }
        $c = Connection::query()->firstOrNew(['user_id' => $user, 'service' => $p['service'],
            'external_id' => $identity['id'], 'environment' => $environment]);
        // Reconnection never reassigns another identity's grants.
        $old = $c->exists ? $c->credentials : [];
        if (empty($credentials['refresh_token']) && ! empty($old['refresh_token'])) {
            $credentials['refresh_token'] = $old['refresh_token'];
        }
        $c->fill(['id' => $c->id ?? (string) Str::uuid(), 'label' => $identity['label'],
            'authorized_at' => now(), 'shop_host' => $flow['shop'] ?? null, 'credentials' => $credentials, 'status' => 'connected', 'expires_at' => $this->expiry($p, $tokens)])->save();

        return $c;
    }

    public function read(Connection $connection): array
    {
        // Database lock serializes token rotation and disconnect across all workers/devices.
        // Caller holds the row lock and commits refreshed credentials even if a later read fails.
        $c = $connection;
        abort_unless($c->status === 'connected', 409, 'Reconnect this account.');
        $p = Catalog::get($c->service);
        $tokens = $c->credentials;
        if ($c->expires_at && $c->expires_at->lessThan(now()->addSeconds(60))) {
            abort_unless(! empty($tokens['refresh_token']), 409, 'This account needs to be reconnected.');
            $new = app(OAuth::class)->token($p, $tokens, ['grant_type' => 'refresh_token', 'refresh_token' => $tokens['refresh_token']]);
            $tokens = array_replace($tokens, array_intersect_key($new, array_flip(['access_token', 'refresh_token', 'scope'])));
            $c->fill(['credentials' => $tokens, 'expires_at' => $this->expiry($p, $new)])->save();
        }

        return app(ProviderRead::class)->read($c->service, $tokens);
    }

    public function metadata(Connection $c, string $device, string $agent): array
    {
        return ['id' => $c->id, 'service' => $c->service, 'label' => $c->label, 'environment' => $c->environment,
            'status' => $c->status, 'assigned' => DB::table('integration_grants')->where('connection_id', $c->id)
                ->where('device', $device)->where('agent', $agent)->exists()];
    }

    private function expiry(array $p, array $tokens): mixed
    {
        $seconds = $tokens['expires_in'] ?? ($p['provider'] === 'stripe' ? 3600 : null);

        return is_numeric($seconds) ? now()->addSeconds(max(0, (int) $seconds)) : null;
    }
}
