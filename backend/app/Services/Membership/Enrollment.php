<?php

namespace App\Services\Membership;

use App\Models\User;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

final class Enrollment
{
    /** Explicit migration; the legacy amount must be reconciled by the operator. */
    public function migrate(User $user, int $expectedLegacy): void
    {
        app(Wallet::class)->ensure($user);
        DB::transaction(function () use ($user, $expectedLegacy) {
            $u = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $w = app(Wallet::class)->lock($u->id);
            if ($w->billing_version == 2) return;
            abort_if($u->membership_ends_at?->isFuture() || ($w->paid_until && now()->lt($w->paid_until)),
                409, 'Keep the existing subscription until its contracted term has ended.');
            abort_if(DB::table('vibes_turns')->where('user_id', $u->id)->whereNull('settled_at')->exists(),
                409, 'Finish or reconcile pending AI work before migrating.');
            abort_if(\App\Services\CloudWorkspaces\Holds::units($u->id) > 0, 409, 'Reconcile hosted computing before migrating.');
            abort_if(\App\Services\Assistant\Holds::units($u->id) > 0, 409, 'Reconcile assistant usage before migrating.');
            abort_if(DB::table('chat_cost_reservations')->where('user_id', $u->id)->whereNull('settled_at')->exists(), 409, 'Reconcile legacy AI reservations before migrating.');
            abort_unless((int) $u->credits_balance === $expectedLegacy, 409, 'Legacy balance changed. Reconcile again.');
            DB::table('vibes_grants')->where('user_id', $u->id)->update([
                'amount' => DB::raw('amount * 10000'), 'remaining' => DB::raw('remaining * 10000')]);
            DB::table('vibes_wallets')->where('user_id', $u->id)->update(['billing_version' => 2]);
            if ($expectedLegacy > 0) app(Wallet::class)->grant($u->id, 'legacy-import:'.$u->id, 'legacy', $expectedLegacy * Units::SCALE);
            $u->forceFill(['credits_balance' => 0, 'plan_renews_at' => null])->save();
            app(Wallet::class)->record($u->id, 'migration:'.$u->id, 'migration', 0,
                ['legacyImported' => $expectedLegacy, 'scale' => Units::SCALE]);
        }, 3);
    }
}
