<?php

namespace App\Services\Billing;

use App\Models\CreditLedger;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CreditDeductor
{
    public function __construct(private readonly CreditCalculator $calculator)
    {
    }

    /**
     * Reset the user's daily counter if the reset window has elapsed.
     */
    public function maybeResetDaily(User $user): void
    {
        $reset = $user->daily_credits_reset_at;
        if (! $reset || $reset->isPast()) {
            $user->forceFill([
                'daily_credits_used' => 0,
                'daily_credits_reset_at' => now()->addDay()->startOfDay(),
            ])->save();
        }
    }

    public function dailyCap(User $user): int
    {
        $plan = $user->plan ?: 'free';
        return (int) config("billing.plans.{$plan}.daily_credit_cap", 5);
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
            ])->save();

            $user->credits_balance = $newBalance;
            $user->credits_used = $fresh->credits_used;
            $user->daily_credits_used = $fresh->daily_credits_used;

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

    public function refresh(User $user, int $monthlyAllowance, ?array $meta = null): CreditLedger
    {
        return DB::transaction(function () use ($user, $monthlyAllowance, $meta) {
            $fresh = User::lockForUpdate()->find($user->id);
            $fresh->forceFill([
                'credits_balance' => $monthlyAllowance,
                'credits_used' => 0,
                'daily_credits_used' => 0,
                'daily_credits_reset_at' => now()->addDay()->startOfDay(),
                'plan_renews_at' => now()->addMonth(),
            ])->save();
            $user->credits_balance = $monthlyAllowance;
            $user->credits_used = 0;
            $user->daily_credits_used = 0;
            $user->plan_renews_at = $fresh->plan_renews_at;

            return CreditLedger::create([
                'user_id' => $user->id,
                'kind' => 'refresh',
                'credits_delta' => $monthlyAllowance,
                'credits_balance_after' => $monthlyAllowance,
                'reference' => 'refresh:' . now()->format('Y-m'),
                'meta' => $meta,
            ]);
        });
    }
}
