<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Vibes\{Plans, Wallet};
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Included monthly cloud-computer seconds (Pro). Sits in front of token metering:
 * Meter draws seconds from here first and charges tokens only for the rest.
 *
 * Size: plans.<plan>.cloudHours (env CLOUD_INCLUDED_HOURS_PRO, default 0 = nothing promised).
 * Period: anchored to the active membership period's start, stepped in whole months
 * (so a yearly period still resets monthly) and capped at the period end. Without an
 * active period it falls back to the calendar month. Usage is a signed ledger
 * (cloud_allowance_usage) keyed by period start, so a reset needs no job.
 * Locks: every write takes the account wallet lock first, the same order as Reservations.
 */
final class Allowance
{
    public const TABLE = 'cloud_allowance_usage';

    public function allowanceSeconds(int $userId): int
    {
        $hours = app(Plans::class)->cloudHours(app(Wallet::class)->planFor($userId));
        return max(0, (int) round($hours * 3600));
    }

    public function overage(): string
    {
        return config('cloud_workspaces.overage') === 'blocked' ? 'blocked' : 'tokens';
    }

    public function remainingSeconds(int $userId): int
    {
        $total = $this->allowanceSeconds($userId);
        return $total > 0 ? max(0, $total - $this->used($userId, $this->period($userId)[0])) : 0;
    }

    /** True when hours are promised, none are left, and overage is blocked: the computer must not run. */
    public function exhaustedAndBlocked(int $userId): bool
    {
        return $this->allowanceSeconds($userId) > 0 && $this->overage() === 'blocked' && $this->remainingSeconds($userId) <= 0;
    }

    public function summary(int $userId): array
    {
        $total = $this->allowanceSeconds($userId);
        [$start, $end] = $this->period($userId);
        return ['allowanceSeconds' => $total, 'usedSeconds' => $total > 0 ? min($total, $this->used($userId, $start)) : 0,
            'resetsAt' => $end->toIso8601String(), 'overage' => $this->overage()];
    }

    /**
     * Draw up to $seconds for one metering window and return how many the allowance covered.
     * Idempotent per workspace + generation + window: a replay returns the first answer unchanged.
     */
    public function consume(object $workspace, int $seconds, ?string $window = null): int
    {
        if ($seconds <= 0) return 0;
        $window ??= $workspace->metered_at ? (string) Carbon::parse($workspace->metered_at)->timestamp : 'none';
        $key = 'consume:'.$workspace->id.':'.$workspace->generation.':'.$window;
        return DB::transaction(function () use ($workspace, $seconds, $key) {
            app(Wallet::class)->lock($workspace->user_id);
            if ($prior = DB::table(self::TABLE)->where('idempotency_key', $key)->first()) return (int) $prior->seconds;
            $total = $this->allowanceSeconds($workspace->user_id);
            if ($total <= 0) return 0;
            $start = $this->period($workspace->user_id)[0];
            $covered = min($seconds, max(0, $total - $this->used($workspace->user_id, $start)));
            $this->write($workspace, $start, 'consume', $covered, $key);
            if ($covered < $seconds && $this->overage() === 'blocked') $this->write($workspace, $start, 'overrun', $seconds - $covered, 'overrun:'.substr($key, 8));
            return $covered;
        });
    }

    /** Meter's view of one window: seconds from the allowance and seconds to charge in tokens. */
    public function split(object $workspace, int $seconds): array
    {
        $covered = $this->consume($workspace, $seconds);
        $blocked = $this->overage() === 'blocked' && $this->allowanceSeconds($workspace->user_id) > 0;
        return ['allowance' => $covered, 'tokens' => $blocked ? 0 : max(0, $seconds - $covered)];
    }

    /**
     * Return up to $seconds consumed by this workspace generation in the current period (a refund).
     * Never below zero used, once per reason. Returns the seconds actually given back.
     */
    public function release(object $workspace, int $seconds, string $reason): int
    {
        if ($seconds <= 0) return 0;
        $key = 'release:'.$reason.':'.$workspace->id.':'.$workspace->generation;
        return DB::transaction(function () use ($workspace, $seconds, $key) {
            app(Wallet::class)->lock($workspace->user_id);
            if ($prior = DB::table(self::TABLE)->where('idempotency_key', $key)->first()) return -(int) $prior->seconds;
            $start = $this->period($workspace->user_id)[0];
            $net = (int) DB::table(self::TABLE)->where('workspace_id', $workspace->id)->where('generation', $workspace->generation)
                ->where('period_start', $start->format('Y-m-d H:i:s'))->whereIn('kind', ['consume', 'release'])->sum('seconds');
            $give = min($seconds, max(0, $net));
            if ($give > 0) $this->write($workspace, $start, 'release', -$give, $key);
            return $give;
        });
    }

    /** Token units to hold for a runway of $amount units, after the allowance covers what it can. */
    public function uncoveredUnits(object $workspace, int $amount): int
    {
        if ($this->allowanceSeconds($workspace->user_id) <= 0) return $amount;
        $remaining = $this->remainingSeconds($workspace->user_id);
        if ($remaining <= 0 && $this->overage() === 'blocked') {
            throw new HttpResponseException(response()->json(['code' => 'allowance_exhausted',
                'message' => 'Your included cloud hours are used up for this period.'], 402));
        }
        if ($this->overage() === 'blocked') return 0;
        $runway = max(1, (int) config('cloud_workspaces.runway_seconds'));
        return intdiv($amount * ($runway - min($remaining, $runway)) + $runway - 1, $runway);
    }

    /** [start, end] of the allowance period containing now. */
    public function period(int $userId): array
    {
        $now = now();
        $p = DB::table('membership_periods')->where('user_id', $userId)->whereNull('revoked_at')->where('disputed', false)
            ->where('starts_at', '<=', $now)->where('ends_at', '>', $now)->orderByDesc('ends_at')->first();
        if (!$p) return [$now->copy()->startOfMonth(), $now->copy()->startOfMonth()->addMonth()];
        $anchor = Carbon::parse($p->starts_at); $k = 0;
        while ($anchor->copy()->addMonthsNoOverflow($k + 1)->lte($now)) $k++;
        $end = $anchor->copy()->addMonthsNoOverflow($k + 1);
        $periodEnd = Carbon::parse($p->ends_at);
        return [$anchor->copy()->addMonthsNoOverflow($k), $periodEnd->lt($end) ? $periodEnd : $end];
    }

    private function used(int $userId, Carbon $start): int
    {
        return max(0, (int) DB::table(self::TABLE)->where('user_id', $userId)->where('period_start', $start->format('Y-m-d H:i:s'))
            ->whereIn('kind', ['consume', 'release'])->sum('seconds'));
    }

    private function write(object $w, Carbon $start, string $kind, int $seconds, string $key): void
    {
        DB::table(self::TABLE)->insertOrIgnore(['user_id' => $w->user_id, 'workspace_id' => $w->id, 'generation' => $w->generation,
            'period_start' => $start->format('Y-m-d H:i:s'), 'kind' => $kind, 'seconds' => $seconds, 'idempotency_key' => $key, 'created_at' => now()]);
    }
}
