<?php

namespace App\Services\Billing;

use App\Models\CreditLedger;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CreditDeductor
{
    public function __construct(private readonly CreditCalculator $calculator) {}

    /**
     * Reset the user's daily / 5-hour burst / weekly counters if their
     * respective windows have elapsed.
     */
    public function maybeResetDaily(User $user): void
    {
        $dirty = [];

        $dailyReset = $user->daily_credits_reset_at;
        if (! $dailyReset || $dailyReset->isPast()) {
            $dirty['daily_credits_used'] = 0;
            $dirty['daily_credits_reset_at'] = now()->addDay()->startOfDay();
        }

        $burstReset = $user->burst_credits_reset_at;
        if (! $burstReset || $burstReset->isPast()) {
            $dirty['burst_credits_used'] = 0;
            $dirty['burst_credits_reset_at'] = now()->addHours(5);
        }

        $weeklyReset = $user->weekly_credits_reset_at;
        if (! $weeklyReset || $weeklyReset->isPast()) {
            $dirty['weekly_credits_used'] = 0;
            $dirty['weekly_credits_reset_at'] = now()->addWeek();
        }

        if (! empty($dirty)) {
            $user->forceFill($dirty)->save();
        }
    }

    public function dailyCap(User $user): int
    {
        $plan = $user->plan ?: 'free';

        return (int) config("billing.plans.{$plan}.daily_credit_cap", 5);
    }

    public function burstCap(User $user): int
    {
        $plan = $user->plan ?: 'free';

        return (int) config("billing.plans.{$plan}.burst_credit_cap", 0);
    }

    public function weeklyCap(User $user): int
    {
        $plan = $user->plan ?: 'free';

        return (int) config("billing.plans.{$plan}.weekly_credit_cap", 0);
    }

    /**
     * Charge the user. Returns the ledger row written. Wrapped in a transaction so
     * concurrent requests can't oversell credits.
     */
    public function chargeForChat(
        User $user,
        string $modelKey,
        ?float $openRouterUsd,
        int $inputTokens,
        int $outputTokens,
        bool $agentMode,
        ?string $reference = null,
        ?array $meta = null,
    ): CreditLedger {
        $result = $this->calculator->actualCredits($modelKey, $openRouterUsd, $inputTokens, $outputTokens, $agentMode);
        $credits = (int) $result['credits'];

        return DB::transaction(function () use ($user, $modelKey, $result, $credits, $inputTokens, $outputTokens, $reference, $meta) {
            $fresh = User::lockForUpdate()->find($user->id);
            $newBalance = max(0, (int) $fresh->credits_balance - $credits);
            $fresh->forceFill([
                'credits_balance' => $newBalance,
                'credits_used' => (int) $fresh->credits_used + $credits,
                'daily_credits_used' => (int) $fresh->daily_credits_used + $credits,
                'burst_credits_used' => (int) $fresh->burst_credits_used + $credits,
                'weekly_credits_used' => (int) $fresh->weekly_credits_used + $credits,
            ])->save();

            $user->credits_balance = $newBalance;
            $user->credits_used = $fresh->credits_used;
            $user->daily_credits_used = $fresh->daily_credits_used;
            $user->burst_credits_used = $fresh->burst_credits_used;
            $user->weekly_credits_used = $fresh->weekly_credits_used;

            return CreditLedger::create([
                'user_id' => $user->id,
                'kind' => 'chat',
                'model_key' => $modelKey,
                'model_slug' => $this->calculator->resolveSlug($modelKey),
                'openrouter_micro_usd' => (int) round(((float) $result['usd']) * 1_000_000),
                'input_tokens' => $inputTokens,
                'output_tokens' => $outputTokens,
                'multiplier_x100' => (int) round(((float) $result['multiplier']) * 100),
                'credits_delta' => -$credits,
                'credits_balance_after' => $newBalance,
                'reference' => $reference,
                'meta' => $meta,
            ]);
        });
    }

    public function grant(User $user, int $credits, string $kind, ?string $reference = null, ?array $meta = null): CreditLedger
    {
        return DB::transaction(function () use ($user, $credits, $kind, $reference, $meta) {
            $fresh = User::lockForUpdate()->find($user->id);
            $newBalance = (int) $fresh->credits_balance + $credits;
            $fresh->forceFill(['credits_balance' => $newBalance])->save();
            $user->credits_balance = $newBalance;

            return CreditLedger::create([
                'user_id' => $user->id,
                'kind' => $kind,
                'credits_delta' => $credits,
                'credits_balance_after' => $newBalance,
                'reference' => $reference,
                'meta' => $meta,
            ]);
        });
    }

    public function spend(User $user, int $credits, string $kind, ?string $reference = null, ?array $meta = null): CreditLedger
    {
        return DB::transaction(function () use ($user, $credits, $kind, $reference, $meta) {
            $fresh = User::lockForUpdate()->find($user->id);
            $newBalance = max(0, (int) $fresh->credits_balance - $credits);
            $fresh->forceFill([
                'credits_balance' => $newBalance,
                'credits_used' => (int) $fresh->credits_used + $credits,
                'daily_credits_used' => (int) $fresh->daily_credits_used + $credits,
                'burst_credits_used' => (int) $fresh->burst_credits_used + $credits,
                'weekly_credits_used' => (int) $fresh->weekly_credits_used + $credits,
            ])->save();
            $user->credits_balance = $newBalance;
            $user->credits_used = $fresh->credits_used;
            $user->daily_credits_used = $fresh->daily_credits_used;
            $user->burst_credits_used = $fresh->burst_credits_used;
            $user->weekly_credits_used = $fresh->weekly_credits_used;

            return CreditLedger::create([
                'user_id' => $user->id,
                'kind' => $kind,
                'credits_delta' => -$credits,
                'credits_balance_after' => $newBalance,
                'reference' => $reference,
                'meta' => $meta,
            ]);
        });
    }

    public function refresh(
        User $user,
        int $monthlyAllowance,
        ?array $meta = null,
        ?string $reference = null
    ): CreditLedger {
        return DB::transaction(function () use ($user, $monthlyAllowance, $meta, $reference) {
            $fresh = User::lockForUpdate()->find($user->id);
            $fresh->forceFill([
                'credits_balance' => $monthlyAllowance,
                'credits_used' => 0,
                'daily_credits_used' => 0,
                'daily_credits_reset_at' => now()->addDay()->startOfDay(),
                'burst_credits_used' => 0,
                'burst_credits_reset_at' => now()->addHours(5),
                'weekly_credits_used' => 0,
                'weekly_credits_reset_at' => now()->addWeek(),
                'plan_renews_at' => now()->addMonth(),
            ])->save();
            $user->credits_balance = $monthlyAllowance;
            $user->credits_used = 0;
            $user->daily_credits_used = 0;
            $user->burst_credits_used = 0;
            $user->weekly_credits_used = 0;
            $user->plan_renews_at = $fresh->plan_renews_at;

            return CreditLedger::create([
                'user_id' => $user->id,
                'kind' => 'refresh',
                'credits_delta' => $monthlyAllowance,
                'credits_balance_after' => $monthlyAllowance,
                'reference' => $reference ?: 'refresh:'.now()->format('Y-m'),
                'meta' => $meta,
            ]);
        });
    }
}
