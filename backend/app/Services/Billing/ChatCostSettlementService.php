<?php

namespace App\Services\Billing;

use App\Models\ChatCostReservation;
use App\Models\CreditLedger;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ChatCostSettlementService
{
    public function __construct(private readonly CreditCalculator $calculator)
    {
    }

    public function settle(ChatCostReservation $reservation, array $attempts, array $meta = []): CreditLedger
    {
        return DB::transaction(function () use ($reservation, $attempts, $meta) {
            $current = ChatCostReservation::whereKey($reservation->id)->firstOrFail();
            if ($current->status === ChatCostReservation::STATUS_SETTLED) {
                return $this->ledgerFor($current);
            }
            $claimed = ChatCostReservation::whereKey($current->id)
                ->where('status', ChatCostReservation::STATUS_PENDING)
                ->update(['status' => ChatCostReservation::STATUS_SETTLING, 'updated_at' => now()]);
            if ($claimed !== 1) {
                $ledger = CreditLedger::where('user_id', $current->user_id)
                    ->where('reference', $current->reference)->first();
                if ($ledger) {
                    return $ledger;
                }
                throw new RuntimeException('This chat cost reservation is already being finalized.');
            }

            $totals = $this->attemptTotals($current, $attempts);
            $this->applyUserSettlement($current, $totals);
            $fresh = User::findOrFail($current->user_id);
            $ledger = CreditLedger::create([
                'user_id' => $fresh->id,
                'kind' => 'chat',
                'model_key' => $current->model_key,
                'model_slug' => $current->model_slug,
                'openrouter_micro_usd' => $totals['micro_usd'],
                'input_tokens' => $totals['input_tokens'],
                'output_tokens' => $totals['output_tokens'],
                'multiplier_x100' => $totals['multiplier_x100'],
                'credits_delta' => -$totals['credits'],
                'credits_balance_after' => (int) $fresh->credits_balance,
                'reference' => $current->reference,
                'meta' => array_merge((array) $current->meta, $meta, ['attempts' => $attempts]),
            ]);
            $current->forceFill([
                'status' => ChatCostReservation::STATUS_SETTLED,
                'actual_credits' => $totals['credits'],
                'actual_micro_usd' => $totals['micro_usd'],
                'input_tokens' => $totals['input_tokens'],
                'output_tokens' => $totals['output_tokens'],
                'attempts' => $attempts,
                'settled_at' => now(),
            ])->save();

            return $ledger;
        }, 5);
    }

    private function attemptTotals(ChatCostReservation $reservation, array $attempts): array
    {
        $totals = ['credits' => 0, 'micro_usd' => 0, 'input_tokens' => 0, 'output_tokens' => 0];
        $multiplier = 100;
        foreach ($attempts as $attempt) {
            if (! ($attempt['billable'] ?? false)) {
                continue;
            }
            if ($attempt['charge_reserved_estimate'] ?? false) {
                $totals['credits'] += (int) $reservation->reserved_credits;
                $totals['micro_usd'] += (int) $reservation->reserved_micro_usd;
                continue;
            }
            $usage = (array) ($attempt['usage'] ?? []);
            $input = (int) ($usage['prompt_tokens'] ?? $attempt['estimated_input_tokens'] ?? 0);
            $output = (int) ($usage['completion_tokens'] ?? $attempt['estimated_output_tokens'] ?? 0);
            $actual = $this->calculator->actualCredits(
                (string) $reservation->model_key,
                array_key_exists('cost', $usage) ? (float) $usage['cost'] : null,
                $input,
                $output,
                (bool) ($reservation->meta['agent_mode'] ?? false),
                (float) ($reservation->meta['request_cost_multiplier'] ?? 1.0),
            );
            $totals['credits'] += max(
                (int) ($attempt['minimum_credits'] ?? 0),
                (int) $actual['credits']
            );
            $totals['micro_usd'] += (int) round(((float) $actual['usd']) * 1_000_000);
            $totals['input_tokens'] += $input;
            $totals['output_tokens'] += $output;
            $multiplier = max($multiplier, (int) round(((float) $actual['multiplier']) * 100));
        }
        if ($totals['credits'] <= 0) {
            $totals['credits'] = (int) $reservation->reserved_credits;
            $totals['micro_usd'] = (int) $reservation->reserved_micro_usd;
        }
        $totals['multiplier_x100'] = $multiplier;

        return $totals;
    }

    private function applyUserSettlement(ChatCostReservation $reservation, array $totals): void
    {
        $creditAdjustment = (int) $reservation->reserved_credits - $totals['credits'];
        $quotaReserved = max(0, (int) (
            $reservation->meta['quota_reserved_credits'] ?? $reservation->reserved_credits
        ));
        $quotaAdjustment = $totals['credits'] - $quotaReserved;
        DB::table('users')->where('id', $reservation->user_id)->update([
            'credits_balance' => DB::raw('credits_balance + '.$creditAdjustment),
            'credits_used' => DB::raw('credits_used + '.(int) $totals['credits']),
            'daily_credits_used' => $this->nonNegative('daily_credits_used', $quotaAdjustment),
            'burst_credits_used' => $this->nonNegative('burst_credits_used', $quotaAdjustment),
            'weekly_credits_used' => $this->nonNegative('weekly_credits_used', $quotaAdjustment),
            'openrouter_reserved_micro_usd' => $this->nonNegative(
                'openrouter_reserved_micro_usd',
                -(int) $reservation->reserved_micro_usd
            ),
            'openrouter_spent_micro_usd' => DB::raw(
                'openrouter_spent_micro_usd + '.(int) $totals['micro_usd']
            ),
            'updated_at' => now(),
        ]);
    }

    private function nonNegative(string $column, int $adjustment): mixed
    {
        $value = "{$column} + ({$adjustment})";

        return DB::raw("CASE WHEN {$value} < 0 THEN 0 ELSE {$value} END");
    }

    private function ledgerFor(ChatCostReservation $reservation): CreditLedger
    {
        return CreditLedger::where('user_id', $reservation->user_id)
            ->where('reference', $reservation->reference)
            ->firstOrFail();
    }
}
