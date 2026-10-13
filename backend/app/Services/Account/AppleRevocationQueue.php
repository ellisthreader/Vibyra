<?php

namespace App\Services\Account;

use Illuminate\Support\Facades\DB;

/** Apple-only outbox: committed with account deletion, no user FK, no plaintext credentials. */
final class AppleRevocationQueue
{
    public function stage(int $userId, ?array $material): void
    {
        $pending = ($material['status'] ?? null) === 'pending' && is_string($material['payload'] ?? null);
        DB::table('apple_account_revocations')->insert([
            'user_id' => $userId, 'payload' => $pending ? $material['payload'] : null,
            'status' => $pending ? 'pending' : 'manual', 'attempts' => 0,
            'next_attempt_at' => $pending ? now() : null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        // Never revoke an Apple identity for a deletion later rolled back by an outer transaction.
        if ($pending) DB::afterCommit(function () use ($userId): void {
            try { $this->process($userId); } catch (\Throwable) {
                // The committed outbox remains retryable; never turn successful deletion into a false failure.
            }
        });
    }

    public function status(int $userId): string
    {
        return (string) (DB::table('apple_account_revocations')->where('user_id', $userId)
            ->value('status') ?? 'not_required');
    }

    public function process(int $userId): bool
    {
        $row = DB::table('apple_account_revocations')->where('user_id', $userId)->first();
        if (! $row || $row->status !== 'pending') return ! $row || $row->status === 'complete';
        $revoked = is_string($row->payload) && app(AppleAccountRevocation::class)->revoke($row->payload);
        // A concurrent successful attempt wins. A later timeout cannot restore its token or status.
        DB::table('apple_account_revocations')->where('id', $row->id)->where('status', 'pending')
            ->where('payload', $row->payload)->update([
                'status' => $revoked ? 'complete' : 'pending',
                'payload' => $revoked ? null : $row->payload,
                'attempts' => DB::raw('attempts + 1'),
                'last_error' => $revoked ? null : 'apple_revocation_pending',
                'next_attempt_at' => $revoked ? null : now()->addMinutes(min(60, 2 ** min(6, (int) $row->attempts))),
                'completed_at' => $revoked ? now() : null, 'updated_at' => now(),
            ]);
        return $this->status($userId) === 'complete';
    }
}
