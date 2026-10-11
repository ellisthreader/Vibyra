<?php

namespace App\Services\Spend;

use App\Services\Membership\Units;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * A person's own spend limits (daily, monthly, per task) on Vibyra tokens. Every method is
 * called with the account wallet lock already held, inside the spender's transaction, so
 * it adds no lock and no new lock order. Checked at admission and bounded in flight: new
 * work is refused once a cap is reached, work already running finishes and settles, so a
 * cap is exceeded by at most one in-flight reservation. Inert unless SPEND_CAPS_ENABLED.
 */
final class SpendCaps
{
    public function __construct(private readonly Counters $counters, private readonly Alerts $alerts) {}

    public static function enabled(): bool
    {
        return (bool) config('spend_caps.enabled');
    }

    /** A spender's native units (Vibes on legacy wallets, 1/10,000 token on modern ones) as canonical units. */
    public static function canon(int $native, int $scale): int
    {
        return $native * intdiv(Units::SCALE, max(1, $scale));
    }

    public function wallet(int $user): ?object
    {
        return DB::table('vibes_wallets')->where('user_id', $user)->first();
    }

    /** The cap for one period, plus any "raise for today" recorded on exactly this period's row. */
    public static function limit(object $w, string $kind, object $row): ?int
    {
        $cap = $w->{"cap_{$kind}_units"};
        if ($cap === null) return null;
        return (int) $cap + (int) $row->raised_units;
    }

    /** Refuse new work once a daily or monthly cap is reached. Nothing is reserved before this passes. */
    public function guard(int $user, ?object $wallet = null): void
    {
        if (!self::enabled()) return;
        $w = $wallet ?? $this->wallet($user);
        if (!$w) return;
        foreach (Periods::KINDS as $kind) {
            if ($w->{"cap_{$kind}_units"} === null) continue;
            $row = $this->counters->current($user, $kind, $w->cap_timezone);
            $used = (int) $row->held + (int) $row->spent;
            $limit = self::limit($w, $kind, $row);
            if ($used >= $limit) throw Refusal::for($kind, $limit, $used, $w->cap_timezone, Carbon::parse($row->ends_at, 'UTC'));
        }
    }

    /** A reservation was made (same transaction as the wallet hold). */
    public function hold(int $user, int $nativeUnits, int $scale, ?object $wallet = null): void
    {
        if (!self::enabled()) return;
        $w = $wallet ?? $this->wallet($user);
        $this->counters->hold($user, self::canon($nativeUnits, $scale), $w->cap_timezone ?? null);
    }

    /** A reservation settled: the unused part returns, the charge is spent, thresholds are checked. */
    public function settle(int $user, int $reserved, int $charged, int $scale, string $madeAt): void
    {
        if (!self::enabled()) return;
        $rows = $this->counters->settle($user, self::canon($reserved, $scale), self::canon($charged, $scale), $madeAt);
        $w = $rows ? $this->wallet($user) : null;
        if ($w) $this->alerts->after($user, $w, $rows);
    }

    /** The reservation ceiling a quote may ask for: the smaller of the person's per-task limit and the existing one. */
    public function limitQuote(int $user, float|int $maxTokens): float|int
    {
        $micro = $this->runLimitMicro($user);
        return $micro === null ? $maxTokens : min($maxTokens, $micro / Units::SCALE);
    }

    /** Per-task limit in micro-USD (one canonical unit is one micro-USD), or null when none is set. */
    public function runLimitMicro(int $user): ?int
    {
        if (!self::enabled()) return null;
        $cap = $this->wallet($user)?->cap_run_units;
        return $cap === null ? null : (int) $cap;
    }

    /**
     * Between steps of a running turn: has the person's limit been reached? Its own reservation
     * is swapped for what it has really cost so far, so a generous reservation never pauses it.
     * Returns the refusal detail (and sends the one per-task alert), or null to keep going.
     */
    public function paused(object $turn): ?array
    {
        if (!self::enabled()) return null;
        $w = $this->wallet((int) $turn->user_id);
        if (!$w) return null;
        $own = self::canon((int) $turn->reserved, (int) ($turn->unit_scale ?? 1));
        foreach (Periods::KINDS as $kind) {
            if ($w->{"cap_{$kind}_units"} === null) continue;
            $row = $this->counters->current((int) $turn->user_id, $kind, $w->cap_timezone);
            $counted = $turn->created_at >= $row->starts_at ? $own : 0;
            $used = max(0, (int) $row->held + (int) $row->spent - $counted) + (int) $turn->actual_micro_usd;
            $limit = self::limit($w, $kind, $row);
            if ($used >= $limit) return Refusal::for($kind, $limit, $used, $w->cap_timezone, Carbon::parse($row->ends_at, 'UTC'))->detail;
        }
        if ($w->cap_run_units !== null && (int) $turn->actual_micro_usd >= (int) $w->cap_run_units) return $this->runPaused($turn, $w);
        return null;
    }

    /** The turn's budget ran out while a per-task limit is what bounded it. */
    public function runPaused(object $turn, ?object $w = null): array
    {
        $w ??= $this->wallet((int) $turn->user_id);
        $this->alerts->run((int) $turn->user_id, (string) $turn->id, (int) $w->cap_run_units, (int) $turn->actual_micro_usd);
        return Refusal::for('run', (int) $w->cap_run_units, (int) $turn->actual_micro_usd, $w->cap_timezone, null)->detail;
    }
}
