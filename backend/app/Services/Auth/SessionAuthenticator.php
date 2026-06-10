<?php

namespace App\Services\Auth;

use App\Models\VibyraSession;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Log;

class SessionAuthenticator
{
    public function authenticate(string $token, array $metadata = []): ?array
    {
        if ($token === '') {
            return null;
        }

        $hash = hash('sha256', $token);
        $session = VibyraSession::query()
            ->whereNull('revoked_at')
            ->where(function ($query) use ($hash): void {
                $query->where('token_hash', $hash)
                    ->orWhere('previous_token_hash', $hash);
            })
            ->first();

        if (! $session) {
            return null;
        }

        $usingPreviousToken = hash_equals((string) $session->previous_token_hash, $hash);
        if ($usingPreviousToken
            && (! $session->previous_token_expires_at || $session->previous_token_expires_at->isPast())) {
            return null;
        }

        $now = now();
        $this->initializeDeadlines($session);
        $expiredReason = $this->expiredReason($session, $now);
        if ($expiredReason !== null && $this->lifecycleMode() === 'enforce') {
            $session->revoke($expiredReason);

            return null;
        }
        if ($expiredReason !== null && $this->lifecycleMode() === 'observe') {
            Log::notice('Observed an expired Vibyra app session.', [
                'session_id' => $session->id,
                'user_id' => $session->user_id,
                'reason' => $expiredReason,
            ]);
        }

        $session->forceFill([
            'ip_address' => $metadata['ip_address'] ?? $session->ip_address,
            'user_agent' => $metadata['user_agent'] ?? $session->user_agent,
            'last_used_at' => $now,
            'idle_expires_at' => $this->idleDeadline($now),
        ])->save();

        return [
            'session' => $session,
            'using_previous_token' => $usingPreviousToken,
            'observed_expiry' => $expiredReason,
        ];
    }

    private function initializeDeadlines(VibyraSession $session): void
    {
        $createdAt = $session->created_at ?? now();
        $lastUsedAt = $session->last_used_at ?? $createdAt;
        $updates = [];

        if (! $session->absolute_expires_at) {
            $updates['absolute_expires_at'] = $this->absoluteDeadline($createdAt);
        }
        if (! $session->idle_expires_at) {
            $updates['idle_expires_at'] = $this->idleDeadline($lastUsedAt);
        }
        if ($updates !== []) {
            $session->forceFill($updates)->save();
        }
    }

    private function expiredReason(VibyraSession $session, CarbonInterface $now): ?string
    {
        if ($session->absolute_expires_at && $session->absolute_expires_at->lessThanOrEqualTo($now)) {
            return 'absolute_expired';
        }
        if ($session->idle_expires_at && $session->idle_expires_at->lessThanOrEqualTo($now)) {
            return 'idle_expired';
        }

        return null;
    }

    private function lifecycleMode(): string
    {
        $mode = (string) config('session_security.lifecycle_mode', 'enforce');

        return in_array($mode, ['off', 'observe', 'enforce'], true) ? $mode : 'enforce';
    }

    private function idleDeadline(CarbonInterface $from): CarbonInterface
    {
        return $from->copy()->addMinutes(max(1, (int) config('session_security.idle_minutes', 20160)));
    }

    private function absoluteDeadline(CarbonInterface $from): CarbonInterface
    {
        return $from->copy()->addMinutes(max(1, (int) config('session_security.absolute_minutes', 129600)));
    }
}
