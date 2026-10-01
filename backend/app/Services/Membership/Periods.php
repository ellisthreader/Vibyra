<?php

namespace App\Services\Membership;

use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

/** Verified provider facts only. One reference per purchased allowance. */
final class Periods
{
    public function grant(int $userId, array $p): void
    {
        DB::transaction(function () use ($userId, $p) {
            app(Wallet::class)->lock($userId);
            abort_unless(Units::modern($userId), 409, 'Update this account before receiving the new offer.');
            $existing = DB::table('membership_periods')->where('reference', $p['reference'])->first();
            abort_if($existing && ($existing->user_id != $userId || $existing->offer_key !== $p['offer_key']), 409, 'Purchase belongs to another account or offer.');
            if ($existing) return;
            if ($p['subscription_id'] ?? null) {
                $owner = $p['provider'].':'.$p['environment'].':'.$p['subscription_id'];
                DB::table('membership_owners')->insertOrIgnore(['reference' => $owner, 'user_id' => $userId]);
                abort_unless(DB::table('membership_owners')->where('reference', $owner)->value('user_id') == $userId,
                    409, 'Subscription belongs to another account.');
            }
            DB::table('membership_periods')->insert(['user_id' => $userId, ...$p, 'created_at' => now(), 'updated_at' => now()]);
            if (!empty($p['order_id'])) DB::table('membership_orders')->where('id', $p['order_id'])->update(['fulfilled_at' => now()]);
            app(Wallet::class)->grant($userId, $p['reference'], $p['ends_at'] ? 'subscription' : 'topup', $p['units']);
        }, 5);
    }

    /** Cumulative refunds remove only this grant. Spent value is an explicit loss. */
    public function refund(string $reference, int $refundedMinor, bool $revokeMembership = false): void
    {
        $original = DB::table('membership_periods')->where('reference', $reference)->firstOrFail();
        // Persist the refund intent even if existing usage must settle first.
        DB::transaction(function () use ($original, $refundedMinor) {
            app(Wallet::class)->lock($original->user_id);
            DB::table('membership_periods')->where('reference', $original->reference)
                ->where('refund_requested', '<', $refundedMinor)->update(['refund_requested' => $refundedMinor]);
        }, 5);
        DB::transaction(function () use ($original, $refundedMinor, $revokeMembership) {
            app(Wallet::class)->lock($original->user_id);
            $p = DB::table('membership_periods')->where('reference', $original->reference)->firstOrFail();
            $cumulative = min($p->paid_minor, max($p->refunded_minor, $p->refund_requested, $refundedMinor));
            $target = $p->paid_minor > 0 ? intdiv($p->units * $cumulative, $p->paid_minor) : $p->units;
            $delta = max(0, $target - $p->revoked_units);
            $g = DB::table('vibes_grants')->where('reference', $p->reference)->firstOrFail();
            // Retry after settlement instead of resurrecting a refunded reservation.
            abort_if(\App\Services\CloudWorkspaces\Holds::usesGrant($p->user_id, $g->id), 503, 'Refund is waiting for hosted runtime reconciliation.');
            foreach (DB::table('vibes_turns')->where('user_id', $p->user_id)->whereNull('settled_at')->get(['allocations']) as $turn) {
                abort_if(collect(json_decode($turn->allocations, true))->contains('id', $g->id), 503, 'Refund is waiting for usage reconciliation.');
            }
            $remove = min($delta, $g->remaining);
            if ($delta > 0) {
                DB::table('vibes_grants')->where('id', $g->id)->decrement('remaining', $remove);
                app(Wallet::class)->record($p->user_id, 'refund:'.$p->reference.':'.$target, 'refund', -$remove,
                    ['lossUnits' => $delta - $remove]);
            }
            DB::table('membership_periods')->where('reference', $p->reference)->update([
                'refunded_minor' => $cumulative, 'refund_requested' => $cumulative, 'revoked_units' => $target,
                'loss_units' => $p->loss_units + $delta - $remove,
                'revoked_at' => $revokeMembership ? now() : $p->revoked_at, 'updated_at' => now()]);
        }, 5);
    }
}
