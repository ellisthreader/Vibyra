<?php

namespace App\Services\Owner;

use App\Models\User;
use App\Services\Auth\TwoFactor;
use App\Services\Remote\RemoteAccountSecurity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class AccountActions
{
    public function apply(int $actorId, int $targetId, array $input, int $verifiedAt): array
    {
        $fingerprint = hash('sha256', json_encode([$actorId, $targetId, $input], JSON_THROW_ON_ERROR));
        $operation = function (User $target) use ($actorId, $input, $verifiedAt, $fingerprint) {
            $actor = User::findOrFail($actorId);
            abort_unless($actor->hasVerifiedEmail() && !$actor->isGuest() && !$actor->owner_banned_at
                && in_array(strtolower($actor->email), config('owner_analytics.emails', []), true), 403);
            abort_unless(app(TwoFactor::class)->enabled($actor) && $verifiedAt >= now()->subMinutes(10)->timestamp
                && $verifiedAt <= now()->timestamp, 428, 'Verify your owner account again.');
            abort_if(AccountProfile::protected($target, $actorId), 403, 'Owner accounts cannot be changed from these controls.');
            $old = DB::table('owner_account_actions')->where('id', $input['request_id'])->first();
            if ($old) {
                abort_if($old->action === 'cancelled', 409, 'This request was cancelled before it was applied.');
                abort_unless(hash_equals($old->fingerprint, $fingerprint), 409, 'This request ID belongs to a different action.');
                return json_decode($old->result, true, flags: JSON_THROW_ON_ERROR);
            }
            abort_unless((int) $target->owner_action_revision === (int) $input['revision'], 409,
                'This account changed after you opened it. Refresh and review the action again.');
            $details = match ($input['action']) {
                'credit' => app(CreditGrants::class)->apply($target, $input),
                'warn' => $this->warn($target),
                'ban' => $this->ban($target),
                'unban' => $this->unban($target),
            };
            $target->forceFill(['owner_action_revision' => (int) $target->owner_action_revision + 1])->save();
            $receipt = ['request_id' => $input['request_id'], 'actor_id' => $actorId, 'user_id' => $target->id, 'action' => $input['action'],
                'revision' => $target->owner_action_revision, 'created_at' => now()->toIso8601String(), ...$details];
            DB::table('owner_account_actions')->insert(['id' => $input['request_id'], 'actor_id' => $actorId,
                'user_id' => $target->id, 'action' => $input['action'], 'fingerprint' => $fingerprint,
                'reason' => $input['reason'], 'message' => $input['message'],
                'result' => json_encode($receipt, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            return $receipt;
        };
        if ($input['action'] === 'ban') return app(RemoteAccountSecurity::class)->updateIdentity($targetId, $operation);
        return DB::transaction(function () use ($targetId, $operation) {
            $target = User::whereKey($targetId)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            return $operation($target);
        }, 3);
    }

    private function warn(User $target): array
    {
        abort_if($target->isGuest() || $target->owner_banned_at, 409, 'Warnings require an active registered account.');
        return ['visibility' => 'website_account'];
    }

    private function ban(User $target): array
    {
        abort_if($target->owner_banned_at, 409, 'This account is already banned.');
        $target->forceFill(['owner_banned_at' => now(), 'remember_token' => Str::random(60),
            'account_session_epoch' => (int) $target->account_session_epoch + 1])->save();
        app(RemoteAccountSecurity::class)->revokeAppSessions($target->id, null, 'owner_banned');
        if (config('session.driver') === 'database') DB::table(config('session.table', 'sessions'))->where('user_id', $target->id)->delete();
        return ['status' => 'banned'];
    }

    private function unban(User $target): array
    {
        abort_unless($target->owner_banned_at, 409, 'This account is not banned.');
        $target->forceFill(['owner_banned_at' => null])->save();
        return ['status' => 'active'];
    }
}
