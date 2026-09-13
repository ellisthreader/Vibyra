<?php

namespace App\Services\Integrations;

use App\Models\IntegrationAttempt as Attempt;
use App\Models\IntegrationConnection;
use App\Models\VibyraSession;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Attempts
{
    public function start(VibyraSession $session, string $service, string $shop): array
    {
        $p = Catalog::get($service);
        abort_unless(Catalog::ready($p), 503, 'This integration needs Vibyra provider setup before you can connect.');
        $flow = ['state' => Str::random(64), 'verifier' => Str::random(96)];
        if ($p['provider'] === 'shopify') {
            $flow['shop'] = Catalog::shop($shop);
        }
        $attempt = Attempt::query()->create(['id' => (string) Str::uuid(), 'user_id' => $session->user_id,
            'session_id' => $session->id, 'service' => $service, 'state_hash' => hash('sha256', $flow['state']),
            'payload' => $flow, 'expires_at' => now()->addMinutes(10)]);

        return ['attemptId' => $attempt->id, 'authUrl' => app(OAuth::class)->authorize($p, $flow)];
    }

    public function callback(string $service, array $query): void
    {
        $state = $query['state'] ?? null;
        abort_unless(is_string($state) && strlen($state) === 64, 400, 'Invalid authorisation state.');
        $id = Attempt::query()->where('state_hash', hash('sha256', $state))->where('service', $service)->value('id');
        abort_unless($id, 400, 'Authorisation expired.');
        $preview = Attempt::query()->findOrFail($id);
        try {
            IntegrationLock::run($preview->user_id, $service, $preview->payload['shop'] ?? '', function () use ($id, $service, $query): void {
                DB::transaction(function () use ($id, $service, $query): void {
                    $a = Attempt::query()->lockForUpdate()->findOrFail($id);
                    abort_unless($a->status === 'pending' && $a->expires_at->isFuture(), 410, 'Authorisation expired.');
                    $session = VibyraSession::query()->find($a->session_id);
                    abort_unless($session && ! $session->revoked_at && $session->idle_expires_at?->isFuture()
                        && $session->absolute_expires_at?->isFuture(), 401, 'Sign in to Vibyra again.');
                    $p = Catalog::get($service);
                    if ($p['provider'] === 'shopify') {
                        app(OAuth::class)->verifyShop($p, $a->payload, $query);

                    }
                    try {
                        if ($p['provider'] === 'shopify') {
                            abort_if(IntegrationConnection::query()->where('shop_host', $a->payload['shop'])
                                ->where('user_id', '!=', $a->user_id)->exists(), 409, 'This store is already connected to another Vibyra account.');
                        }
                        abort_if(isset($query['error']), 409, 'Access was declined.');
                        abort_unless(is_string($query['code'] ?? null) && strlen($query['code']) < 4096, 400, 'Missing authorisation code.');
                        $tokens = app(OAuth::class)->token($p, $a->payload, ['grant_type' => 'authorization_code', 'code' => $query['code']]);
                        $c = app(Connections::class)->save($a->user_id, $p, $tokens, $a->payload);
                        $a->fill(['status' => 'complete', 'connection_id' => $c->id, 'payload' => []])->save();
                    } catch (\Throwable) {
                        // A consumed code is never retried. Keep a safe durable failure for desktop polling.
                        $a->fill(['status' => 'failed', 'payload' => []])->save();
                    }
                });
            });
        } catch (LockTimeoutException) {
            DB::transaction(function () use ($id): void {
                $a = Attempt::query()->lockForUpdate()->findOrFail($id);
                if ($a->status === 'pending') {
                    $a->fill(['status' => 'failed', 'payload' => []])->save();
                }
            });
        }
    }

    public function status(VibyraSession $session, string $id, bool $cancel): array
    {
        return DB::transaction(function () use ($session, $id, $cancel): array {
            $a = Attempt::query()->where('session_id', $session->id)->where('user_id', $session->user_id)
                ->lockForUpdate()->findOrFail($id);
            if ($a->status === 'pending' && ($cancel || $a->expires_at->isPast())) {
                $a->fill(['status' => $cancel ? 'cancelled' : 'expired', 'payload' => []])->save();
            }

            return ['status' => $a->status, 'connectionId' => $a->connection_id];
        });
    }
}
