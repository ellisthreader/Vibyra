<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Cache;
use RuntimeException;

/** Callers hold the user row lock. Purpose-specific keys cannot be spent at another endpoint. */
class TwoFactorCodes
{
    public function send(string $scope, string $state, string $method, string $destination): void
    {
        $key = $this->key($scope);
        $old = Cache::get($key);
        if (is_array($old) && ($old['state'] ?? '') === $state) {
            if (($old['left'] ?? 0) <= 0 || $old['expires'] <= now()->timestamp) {
                throw new RuntimeException('Start a new verification to request another code.');
            }
            if (($old['sent'] ?? 0) > now()->timestamp - 60) throw new RuntimeException('Wait a minute before requesting another code.');
        } else $old = null;
        do { $code = (string) random_int(100000, 999999); }
        while ($old && hash_equals($old['digest'], $this->digest($scope, $code)));
        try { app(TwoFactorDelivery::class)->send($method, $destination, $code); }
        catch (\Throwable $error) { throw new RuntimeException('Could not deliver the verification code.', previous: $error); }
        $record = ['state' => $state, 'digest' => $this->digest($scope, $code),
            'left' => $old['left'] ?? 5, 'expires' => $old['expires'] ?? now()->addMinutes(5)->timestamp,
            'sent' => now()->timestamp];
        Cache::put($key, $record, now()->setTimestamp($record['expires']));
    }

    public function check(string $scope, string $state, string $code): bool
    {
        $key = $this->key($scope); $record = Cache::get($key);
        if (! is_array($record) || ($record['state'] ?? '') !== $state
            || ($record['left'] ?? 0) <= 0 || $record['expires'] <= now()->timestamp) return false;
        $valid = preg_match('/^\d{6}$/', $code) && hash_equals($record['digest'], $this->digest($scope, $code));
        // Keep an exhausted tombstone until expiry: resending cannot reset the guess budget.
        $record['left'] = $valid ? 0 : $record['left'] - 1;
        Cache::put($key, $record, now()->setTimestamp($record['expires']));
        return (bool) $valid;
    }

    public function sent(string $scope, string $state): bool
    {
        $record = Cache::get($this->key($scope));
        return is_array($record) && ($record['state'] ?? '') === $state
            && ($record['left'] ?? 0) > 0 && $record['expires'] > now()->timestamp;
    }

    private function key(string $scope): string { return 'two-factor:code:'.hash('sha256', $scope); }
    private function digest(string $scope, string $code): string
    {
        return hash_hmac('sha256', $scope.':'.$code, (string) config('app.key'));
    }
}
