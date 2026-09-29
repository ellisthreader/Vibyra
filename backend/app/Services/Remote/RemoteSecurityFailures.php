<?php

namespace App\Services\Remote;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\{Cache, RateLimiter};

/** Short principal-specific delays; no email-address lockouts or IP identity claims. */
class RemoteSecurityFailures
{
    public function check(VibyraSession $session, ?string $device = null, ?string $ip = null): void
    {
        $until = (int) Cache::get($this->key($session, $device, $ip).':until', 0);
        if ($until > now()->timestamp) throw new RemoteAccessException('Wait a moment before trying remote verification again.', 429, 'remote_verification_delayed');
    }

    public function failure(VibyraSession $session, ?string $device = null, ?string $ip = null): void
    {
        $key = $this->key($session, $device, $ip);
        RateLimiter::hit($key, 60);
        $count = RateLimiter::attempts($key);
        if ($count >= 3) {
            $seconds = min(60, 2 ** min(6, $count - 2));
            Cache::put($key.':until', now()->timestamp + $seconds, $seconds);
        }
        $account = 'remote:failed-account:'.$session->user_id;
        RateLimiter::hit($account, 60);
        $total = RateLimiter::attempts($account);
        if ($total >= 10 && Cache::add($account.':warned', true, 60)) {
            app(SecurityEvents::class)->record((int) $session->user_id, 'REMOTE_ACCESS_FAILURES', ['count' => $total]);
        }
    }

    public function rejected(VibyraSession $session, RemoteAccessException $error, ?string $device = null, ?string $ip = null): void
    {
        if (in_array($error->status, [401, 403], true)
            && ! in_array($error->errorCode, ['remote_disabled', 'device_not_trusted', 'remote_permission_denied'], true)) {
            $this->failure($session, $device, $ip);
        }
    }

    private function key(VibyraSession $session, ?string $device, ?string $ip): string
    {
        return 'remote:failure:'.hash('sha256', $session->user_id.':'.$session->id.':'.($device ?? '').':'.($ip ?? ''));
    }
}
