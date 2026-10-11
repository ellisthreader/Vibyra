<?php

namespace App\Services\Spend;

use Illuminate\Support\Facades\DB;

/**
 * O(1) spend counters, one row per account, kind and period. Every method runs with the
 * account's wallet lock already held (the same one all spenders take), so a plain
 * read-modify-write is race-free and no SUM over turns is ever needed.
 *
 * `held` is reserved-but-unsettled units and `spent` is settled charges, both canonical
 * (10,000 per token). A settled turn moves its reservation from `held` to `spent` and
 * returns the unused part, in the period the reservation was made in.
 */
final class Counters
{
    private const TABLE = 'wallet_spend_periods';

    /** The row for the period containing `$at`, created on first use. */
    public function current(int $user, string $kind, ?string $tz): object
    {
        [$start, $end] = Periods::bounds($kind, $tz);
        DB::table(self::TABLE)->insertOrIgnore(['user_id' => $user, 'kind' => $kind,
            'starts_at' => $start->format('Y-m-d H:i:s'), 'ends_at' => $end->format('Y-m-d H:i:s')]);
        return DB::table(self::TABLE)->where('user_id', $user)->where('kind', $kind)
            ->where('starts_at', $start->format('Y-m-d H:i:s'))->first();
    }

    /** Reading only: the current row, or null when nothing has been counted yet this period. */
    public function peek(int $user, string $kind): ?object
    {
        return DB::table(self::TABLE)->where('user_id', $user)->where('kind', $kind)
            ->where('starts_at', '<=', now()->utc()->format('Y-m-d H:i:s'))->where('ends_at', '>', now()->utc()->format('Y-m-d H:i:s'))->first();
    }

    /** A reservation is made: it counts against every period right away. */
    public function hold(int $user, int $units, ?string $tz): void
    {
        foreach (Periods::KINDS as $kind) {
            DB::table(self::TABLE)->where('id', $this->current($user, $kind, $tz)->id)->increment('held', $units);
        }
    }

    /**
     * A reservation settles. Rows are found by when the reservation was made, never by "now",
     * so a turn that straddles midnight still adjusts the period it was counted in. A missing
     * row (the hold predates the flag) is skipped; counters never go below zero.
     *
     * @return array<string,object> the touched rows after the change, keyed by kind
     */
    public function settle(int $user, int $heldUnits, int $spentUnits, string $madeAt): array
    {
        $at = \Illuminate\Support\Carbon::parse($madeAt)->utc()->format('Y-m-d H:i:s');
        $rows = [];
        foreach (Periods::KINDS as $kind) {
            $row = DB::table(self::TABLE)->where('user_id', $user)->where('kind', $kind)
                ->where('starts_at', '<=', $at)->where('ends_at', '>', $at)->first();
            if (!$row) continue;
            DB::table(self::TABLE)->where('id', $row->id)->update([
                'held' => max(0, $row->held - $heldUnits), 'spent' => $row->spent + max(0, $spentUnits)]);
            $rows[$kind] = DB::table(self::TABLE)->where('id', $row->id)->first();
        }
        return $rows;
    }

    public function flag(int $id, string $column): void
    {
        DB::table(self::TABLE)->where('id', $id)->update([$column => true]);
    }

    /** A changed cap starts its thresholds afresh. */
    public function reset(int $user, string $kind): void
    {
        DB::table(self::TABLE)->where('user_id', $user)->where('kind', $kind)->where('ends_at', '>', now())
            ->update(['alerted_warn' => false, 'alerted_full' => false]);
    }
}
