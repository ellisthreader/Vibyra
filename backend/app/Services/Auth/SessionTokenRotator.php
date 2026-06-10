<?php

namespace App\Services\Auth;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class SessionTokenRotator
{
    public function rotate(VibyraSession $session, ?string $expectedTokenHash = null): array
    {
        return DB::transaction(function () use ($session, $expectedTokenHash): array {
            $locked = VibyraSession::query()->lockForUpdate()->find($session->id);
            if (! $locked || $locked->revoked_at) {
                throw new RuntimeException('The session is no longer active.');
            }
            if ($expectedTokenHash !== null && ! hash_equals($locked->token_hash, $expectedTokenHash)) {
                throw new RuntimeException('The session token has already rotated.');
            }

            $token = Str::random(72);
            $graceSeconds = max(0, (int) config('session_security.previous_token_grace_seconds', 120));
            $locked->forceFill([
                'previous_token_hash' => $graceSeconds > 0 ? $locked->token_hash : null,
                'previous_token_expires_at' => $graceSeconds > 0 ? now()->addSeconds($graceSeconds) : null,
                'token_hash' => hash('sha256', $token),
                'rotated_at' => now(),
            ])->save();

            return [
                'session' => $locked,
                'token' => $token,
                'previous_token_grace_seconds' => $graceSeconds,
            ];
        });
    }

    public function manualRotationEnabled(): bool
    {
        return $this->rotationMode() === 'manual';
    }

    private function rotationMode(): string
    {
        $mode = (string) config('session_security.rotation_mode', 'manual');

        return in_array($mode, ['off', 'manual'], true) ? $mode : 'manual';
    }
}
