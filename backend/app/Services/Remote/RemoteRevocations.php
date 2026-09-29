<?php
namespace App\Services\Remote;

use Illuminate\Support\Facades\DB;

/** Durable, idempotent delivery; admission/renewal remains authoritative during outages. */
class RemoteRevocations
{
    public function queue(string $hostId, int $generation): void
    {
        DB::table('remote_revocations')->insertOrIgnore([
            'host_id' => $hostId, 'generation' => $generation, 'attempts' => 0,
            'next_attempt_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function pending(string $hostId): bool
    {
        return DB::table('remote_revocations')->where('host_id', $hostId)->whereNull('acknowledged_at')->exists();
    }

    public function deliver(?string $hostId = null): int
    {
        $rows = DB::table('remote_revocations')->whereNull('acknowledged_at')
            ->where('next_attempt_at', '<=', now())->when($hostId, fn ($q) => $q->where('host_id', $hostId))
            ->orderBy('id')->limit($hostId === null ? 20 : 1)->get();
        $delivered = 0;
        foreach ($rows as $row) {
            $ok = app(RelayGateway::class)->disconnect($row->host_id, generation: (int) $row->generation);
            DB::table('remote_revocations')->where('id', $row->id)->whereNull('acknowledged_at')->update([
                'attempts' => $row->attempts + 1, 'updated_at' => now(),
                'next_attempt_at' => now()->addSeconds(min(300, 5 * (2 ** min(6, $row->attempts)))),
                'acknowledged_at' => $ok ? now() : null,
            ]);
            $delivered += (int) $ok;
        }
        return $delivered + ($hostId === null ? app(RemoteSessionRevocations::class)->deliver() : 0);
    }
}
