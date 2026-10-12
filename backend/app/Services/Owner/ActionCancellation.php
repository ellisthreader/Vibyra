<?php

namespace App\Services\Owner;

use App\Models\User;
use App\Services\Auth\TwoFactor;
use Illuminate\Support\Facades\DB;

/** A tombstone fences an HTTP submission that arrives after browser recovery. */
final class ActionCancellation
{
    public function cancel(int $actorId, int $targetId, string $id, int $verifiedAt): array
    {
        return DB::transaction(function () use ($actorId, $targetId, $id, $verifiedAt) {
            $target = User::whereKey($targetId)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            $actor = User::findOrFail($actorId);
            abort_unless(AccountNotices::owner($actor), 403);
            abort_unless(app(TwoFactor::class)->enabled($actor) && $verifiedAt >= now()->subMinutes(10)->timestamp
                && $verifiedAt <= now()->timestamp, 428, 'Verify your owner account again.');
            abort_if(AccountProfile::protected($target, $actorId), 403);
            $old = DB::table('owner_account_actions')->where('id', $id)->first();
            if ($old) {
                abort_unless((int) $old->actor_id === $actorId && (int) $old->user_id === $targetId, 409);
                return json_decode($old->result, true, flags: JSON_THROW_ON_ERROR);
            }
            $receipt = ['request_id' => $id, 'actor_id' => $actorId, 'user_id' => $targetId, 'action' => 'cancelled',
                'revision' => $target->owner_action_revision, 'created_at' => now()->toIso8601String()];
            DB::table('owner_account_actions')->insert(['id' => $id, 'actor_id' => $actorId, 'user_id' => $targetId,
                'action' => 'cancelled', 'fingerprint' => hash('sha256', 'cancelled:'.$actorId.':'.$targetId.':'.$id),
                'reason' => 'Cancelled an unconfirmed request before it was applied.', 'message' => null,
                'result' => json_encode($receipt, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            return $receipt;
        }, 3);
    }
}
