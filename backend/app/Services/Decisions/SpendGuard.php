<?php
namespace App\Services\Decisions;
use Illuminate\Support\Facades\DB;
/** One database mutex across users, processes and all decision purposes. Cache clearing cannot reset spend. */
final class SpendGuard
{
    public function claim(string $id): bool
    {
        return DB::transaction(function () use ($id) {
            $guard = DB::table('decision_spend_controls')->where('id', 1)->lockForUpdate()->first();
            if (!$guard || $guard->tripped || ($guard->busy_until && now()->lt($guard->busy_until))) return false;
            // A dead or stalled worker may already have spent. Do not hand its lease to another payer.
            if ($guard->owner !== null) {
                DB::table('decision_spend_controls')->where('id', 1)->update(['tripped' => true]);
                return false;
            }
            $d = DB::table('ai_decisions')->where('id', $id)->lockForUpdate()->first();
            if (!$d || $d->state !== 'pending' || now()->gte($d->deadline)) return false;
            if (!DB::table('notification_preferences')->where('user_id', $d->user_id)->value('smart')) return false;
            $reserve = max(1, (int) config('intelligence.call_reserve_micro_usd'));
            $day = now()->utc()->format('Ymd'); $minute = now()->utc()->format('YmdHi');
            $limits = [
                'lifetime' => [PHP_INT_MAX, config('intelligence.total_micro_usd')],
                'day:'.$day => [config('intelligence.daily_calls'), config('intelligence.daily_micro_usd')],
                'minute:'.$minute => [config('intelligence.minute_calls'), PHP_INT_MAX],
                'user:'.$d->user_id.':'.$day => [config('intelligence.user_daily_calls'), PHP_INT_MAX],
                'user:'.$d->user_id.':'.$minute => [config('intelligence.user_minute_calls'), PHP_INT_MAX],
            ];
            foreach ($limits as $bucket => [$calls, $money]) {
                $used = DB::table('decision_spend_buckets')->where('id', $bucket)->first();
                if (($used->calls ?? 0) >= $calls || ($used->reserved_micro_usd ?? 0) + $reserve > $money) return false;
            }
            foreach ($limits as $bucket => $_) {
                DB::table('decision_spend_buckets')->insertOrIgnore(['id' => $bucket]);
                DB::table('decision_spend_buckets')->where('id', $bucket)->update([
                    'calls' => DB::raw('calls + 1'), 'reserved_micro_usd' => DB::raw('reserved_micro_usd + '.$reserve)]);
            }
            // Never refund uncertain/failed calls. Reservations survive worker death, retries and audit pruning.
            DB::table('decision_spend_controls')->where('id', 1)->update(['owner' => $id, 'busy_until' => now()->addSeconds(10)]);
            return (bool) DB::table('ai_decisions')->where('id', $id)->where('state', 'pending')
                ->update(['state' => 'classifying', 'claimed_at' => now()]);
        }, 3);
    }
    public function release(string $id, ?int $actual = null, bool $unpriced = false): void
    {
        DB::transaction(function () use ($id, $actual, $unpriced) {
            $g = DB::table('decision_spend_controls')->where('id', 1)->lockForUpdate()->first();
            if (!$g) return;
            // Unexpected pricing trips a durable switch instead of repeatedly overspending the reservation.
            if ($unpriced || ($actual !== null && $actual > config('intelligence.call_reserve_micro_usd'))) {
                DB::table('decision_spend_controls')->where('id', 1)->update(['tripped' => true]);
            }
            if ($g->owner === $id) DB::table('decision_spend_controls')->where('id', 1)->update(['owner' => null, 'busy_until' => null]);
        });
    }
}
