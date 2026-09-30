<?php

namespace App\Services\Remote;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\RateLimiter;

class RemoteSecurityRateLimit
{
    public function check(VibyraSession $session, string $operation, ?string $device = null, ?string $ip = null): void
    {
        app(RemoteSecurityFailures::class)->check($session, $device, $ip);
        $keys = ['remote:'.$operation.':account:'.$session->user_id => 30];
        if ($device !== null) $keys['remote:'.$operation.':device:'.hash('sha256', $session->user_id.':'.$device)] = 10;
        if ($ip !== null) $keys['remote:'.$operation.':ip:'.hash('sha256', $ip)] = 60;
        foreach ($keys as $key => $limit) {
            if (RateLimiter::tooManyAttempts($key, $limit)) throw new RemoteAccessException('Wait a minute before trying remote verification again.', 429);
        }
        foreach ($keys as $key => $limit) RateLimiter::hit($key, 60);
    }
}
