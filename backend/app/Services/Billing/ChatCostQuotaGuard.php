<?php

namespace App\Services\Billing;

use App\Models\User;
use Illuminate\Database\Query\Builder;

class ChatCostQuotaGuard
{
    public function prepare(User $user): void
    {
        $this->resetUsageWindows($user);

        $period = now('UTC')->format('Y-m');
        if ($user->openrouter_spend_period !== $period) {
            $user->forceFill([
                'openrouter_spend_period' => $period,
                'openrouter_reserved_micro_usd' => 0,
                'openrouter_spent_micro_usd' => 0,
            ])->save();
        }
    }

    public function constrain(Builder $query, User $user, int $quotaCredits, int $microUsd): void
    {
        $plan = $user->plan ?: 'free';
        $burstCap = (int) config("billing.plans.{$plan}.burst_credit_cap", 0);
        $weeklyCap = (int) config("billing.plans.{$plan}.weekly_credit_cap", 0);
        $monthlyCap = $this->monthlyCap($user);

        if ($burstCap > 0) {
            $query->whereRaw('burst_credits_used + ? <= ?', [$quotaCredits, $burstCap]);
        }
        if ($weeklyCap > 0) {
            $query->whereRaw('weekly_credits_used + ? <= ?', [$quotaCredits, $weeklyCap]);
        }
        if ($monthlyCap > 0) {
            $query->whereRaw(
                'openrouter_spent_micro_usd + openrouter_reserved_micro_usd + ? <= ?',
                [$microUsd, $monthlyCap]
            );
        }
    }

    public function throwFailure(
        User $user,
        int $balanceCredits,
        int $quotaCredits,
        int $microUsd,
    ): never
    {
        $plan = $user->plan ?: 'free';
        $burstCap = (int) config("billing.plans.{$plan}.burst_credit_cap", 0);
        $weeklyCap = (int) config("billing.plans.{$plan}.weekly_credit_cap", 0);
        $monthlyCap = $this->monthlyCap($user);
        if ((int) $user->credits_balance < $balanceCredits) {
            throw new BillingReservationException(
                'You do not have enough credits for this request. Top up or upgrade your plan to continue.',
                402,
                'billing_credits_exhausted',
                [
                    'creditsBalance' => (int) $user->credits_balance,
                    'estimatedCredits' => $balanceCredits,
                ],
            );
        }
        if ($monthlyCap > 0
            && (int) $user->openrouter_spent_micro_usd
                + (int) $user->openrouter_reserved_micro_usd
                + $microUsd > $monthlyCap) {
            throw new BillingReservationException(
                'Monthly AI cost limit reached. Upgrade your plan or wait for the next billing month.',
                429,
                'billing_monthly_usd_cap',
                ['monthlyUsdCap' => $monthlyCap / 1_000_000],
            );
        }
        if ($burstCap > 0 && (int) $user->burst_credits_used + $quotaCredits > $burstCap) {
            throw new BillingReservationException(
                'Your short-term AI usage limit is reached. Try again after the burst window resets.',
                429,
                'billing_burst_cap',
                [
                    'creditsUsed' => (int) $user->burst_credits_used,
                    'creditsCap' => $burstCap,
                    'estimatedCredits' => $quotaCredits,
                    'resetAt' => $user->burst_credits_reset_at?->toIso8601String(),
                ],
            );
        }
        if ($weeklyCap > 0 && (int) $user->weekly_credits_used + $quotaCredits > $weeklyCap) {
            throw new BillingReservationException(
                'Your weekly AI usage limit is reached. Try again after the weekly window resets.',
                429,
                'billing_weekly_cap',
                [
                    'creditsUsed' => (int) $user->weekly_credits_used,
                    'creditsCap' => $weeklyCap,
                    'estimatedCredits' => $quotaCredits,
                    'resetAt' => $user->weekly_credits_reset_at?->toIso8601String(),
                ],
            );
        }

        throw new BillingReservationException(
            'Your current AI usage window does not have enough capacity for this request.',
            429,
            'billing_usage_cap',
        );
    }

    private function resetUsageWindows(User $user): void
    {
        $dirty = [];
        if (! $user->daily_credits_reset_at || $user->daily_credits_reset_at->isPast()) {
            $dirty['daily_credits_used'] = 0;
            $dirty['daily_credits_reset_at'] = now()->addDay()->startOfDay();
        }
        if (! $user->burst_credits_reset_at || $user->burst_credits_reset_at->isPast()) {
            $dirty['burst_credits_used'] = 0;
            $dirty['burst_credits_reset_at'] = now()->addHours(5);
        }
        if (! $user->weekly_credits_reset_at || $user->weekly_credits_reset_at->isPast()) {
            $dirty['weekly_credits_used'] = 0;
            $dirty['weekly_credits_reset_at'] = now()->addWeek();
        }
        if ($dirty !== []) {
            $user->forceFill($dirty)->save();
        }
    }

    private function monthlyCap(User $user): int
    {
        $plan = $user->plan ?: 'free';
        $cycle = $user->plan_billing_cycle ?: 'monthly';
        $key = $cycle === 'annual' ? 'annual_usd_cap_per_month' : 'usd_cap_per_month';

        return (int) round(
            ((float) config(
                "billing.plans.{$plan}.{$key}",
                config("billing.plans.{$plan}.usd_cap_per_month", 0)
            )) * 1_000_000
        );
    }
}
