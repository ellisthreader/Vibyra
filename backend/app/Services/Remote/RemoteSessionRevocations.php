<?php

namespace App\Services\Remote;

use App\Models\RemoteSession;
use Illuminate\Support\Facades\DB;

/** Session-specific outbox: a missing presence event cannot prevent revocation. */
class RemoteSessionRevocations
{
    public function queue(RemoteSession $session): void
    {
        DB::table('remote_session_revocations')->insertOrIgnore([
            'remote_session_id' => $session->id, 'attempts' => 0,
            'next_attempt_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function pending(int $sessionId): bool
    {
        return DB::table('remote_session_revocations')->where('remote_session_id', $sessionId)
            ->whereNull('acknowledged_at')->exists();
    }

    public function deliver(?int $sessionId = null): int
    {
        $rows = DB::table('remote_session_revocations')->whereNull('acknowledged_at')
            ->where('next_attempt_at', '<=', now())->when($sessionId, fn ($q) => $q->where('remote_session_id', $sessionId))
            ->orderBy('id')->limit($sessionId === null ? 20 : 1)->get();
        $delivered = 0;
        foreach ($rows as $row) {
            $session = RemoteSession::with('host')->find($row->remote_session_id);
            $ok = $session && $session->host && app(RelayGateway::class)->disconnect($session->host->host_id, grantId: $session->grant_id);
            DB::table('remote_session_revocations')->where('id', $row->id)->whereNull('acknowledged_at')->update([
                'attempts' => $row->attempts + 1, 'updated_at' => now(),
                'next_attempt_at' => now()->addSeconds(min(300, 5 * (2 ** min(6, $row->attempts)))),
                'acknowledged_at' => $ok ? now() : null,
            ]);
            $delivered += (int) $ok;
        }
        return $delivered;
    }
}
