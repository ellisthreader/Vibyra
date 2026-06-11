<?php

namespace App\Services\Billing;

use App\Models\ChatCostReservation;
use App\Models\CreditLedger;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ChatCostReservationService
{
    public function __construct(
        private readonly CreditCalculator $calculator,
        private readonly ChatCostQuotaGuard $quotaGuard,
        private readonly ChatCostSettlementService $settlementService,
        private readonly PlanEntitlements $entitlements,
    ) {
    }

    public function reserve(
        User $user,
        string $reference,
        string $modelKey,
        int $credits,
        int $microUsd,
        array $meta = [],
        ?int $quotaCredits = null,
    ): ChatCostReservation {
        $quotaCredits = max(0, $quotaCredits ?? $credits);
        return DB::transaction(function () use (
            $user,
            $reference,
            $modelKey,
            $credits,
            $microUsd,
            $meta,
            $quotaCredits,
        ) {
            $existing = ChatCostReservation::where('user_id', $user->id)
                ->where('reference', $reference)
                ->first();
            if ($existing) {
                return $existing;
            }

            $fresh = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $this->assertAgentCapacity($fresh, $meta);
            $this->quotaGuard->prepare($fresh);
            $query = DB::table('users')->where('id', $fresh->id)
                ->where('credits_balance', '>=', $credits);
            $this->quotaGuard->constrain($query, $fresh, $quotaCredits, $microUsd);
            $updated = $query->update([
                'credits_balance' => DB::raw('credits_balance - '.max(0, $credits)),
                'daily_credits_used' => DB::raw('daily_credits_used + '.$quotaCredits),
                'burst_credits_used' => DB::raw('burst_credits_used + '.$quotaCredits),
                'weekly_credits_used' => DB::raw('weekly_credits_used + '.$quotaCredits),
                'openrouter_reserved_micro_usd' => DB::raw(
                    'openrouter_reserved_micro_usd + '.max(0, $microUsd)
                ),
                'updated_at' => now(),
            ]);
            if ($updated !== 1) {
                $this->quotaGuard->throwFailure(
                    $fresh->fresh() ?? $fresh,
                    $credits,
                    $quotaCredits,
                    $microUsd,
                );
            }

            return ChatCostReservation::create([
                'user_id' => $fresh->id,
                'reference' => $reference,
                'status' => ChatCostReservation::STATUS_PENDING,
                'model_key' => $modelKey,
                'model_slug' => $this->calculator->resolveSlug($modelKey),
                'reserved_credits' => $credits,
                'reserved_micro_usd' => $microUsd,
                'attempts' => [],
                'expires_at' => now()->addMinutes(
                    max(5, (int) config('billing.openrouter_pricing.reservation_ttl_minutes', 30))
                ),
                'meta' => [...$meta, 'quota_reserved_credits' => $quotaCredits],
            ]);
        }, 5);
    }

    public function markProviderStarted(ChatCostReservation $reservation): void
    {
        ChatCostReservation::whereKey($reservation->id)
            ->where('status', ChatCostReservation::STATUS_PENDING)
            ->update(['provider_started_at' => now(), 'updated_at' => now()]);
    }

    public function settle(ChatCostReservation $reservation, array $attempts, array $meta = []): CreditLedger
    {
        return $this->settlementService->settle($reservation, $attempts, $meta);
    }

    public function release(ChatCostReservation $reservation, string $reason): void
    {
        DB::transaction(function () use ($reservation, $reason) {
            $current = ChatCostReservation::whereKey($reservation->id)->firstOrFail();
            $claimed = ChatCostReservation::whereKey($current->id)
                ->where('status', ChatCostReservation::STATUS_PENDING)
                ->update([
                    'status' => ChatCostReservation::STATUS_RELEASED,
                    'release_reason' => $reason,
                    'released_at' => now(),
                    'updated_at' => now(),
                ]);
            if ($claimed !== 1) {
                return;
            }

            $reserved = (int) $current->reserved_credits;
            $quotaReserved = $this->quotaReservedCredits($current);
            DB::table('users')->where('id', $current->user_id)->update([
                'credits_balance' => DB::raw('credits_balance + '.$reserved),
                'daily_credits_used' => $this->nonNegative('daily_credits_used', -$quotaReserved),
                'burst_credits_used' => $this->nonNegative('burst_credits_used', -$quotaReserved),
                'weekly_credits_used' => $this->nonNegative('weekly_credits_used', -$quotaReserved),
                'openrouter_reserved_micro_usd' => $this->nonNegative(
                    'openrouter_reserved_micro_usd',
                    -(int) $current->reserved_micro_usd
                ),
                'updated_at' => now(),
            ]);
        }, 5);
    }

    public function recoverStale(int $limit = 100): array
    {
        $released = 0;
        $settled = 0;
        ChatCostReservation::where('status', ChatCostReservation::STATUS_PENDING)
            ->where('expires_at', '<=', now())
            ->orderBy('id')
            ->limit($limit)
            ->get()
            ->each(function (ChatCostReservation $reservation) use (&$released, &$settled) {
                if ($reservation->provider_started_at) {
                    $this->settle($reservation, [[
                        'billable' => true,
                        'outcome' => 'stale_after_dispatch',
                        'charge_reserved_estimate' => true,
                    ]], ['recovered' => true]);
                    $settled++;

                    return;
                }
                $this->release($reservation, 'stale_before_dispatch');
                $released++;
            });

        return compact('released', 'settled');
    }

    private function nonNegative(string $column, int $adjustment): mixed
    {
        $value = "{$column} + ({$adjustment})";

        return DB::raw("CASE WHEN {$value} < 0 THEN 0 ELSE {$value} END");
    }

    private function quotaReservedCredits(ChatCostReservation $reservation): int
    {
        return max(0, (int) (
            $reservation->meta['quota_reserved_credits'] ?? $reservation->reserved_credits
        ));
    }

    private function assertAgentCapacity(User $user, array $meta): void
    {
        if (($meta['surface'] ?? null) !== 'desktop-terminal') {
            return;
        }
        $limit = $this->entitlements->maxConcurrentTerminalAgents($user->plan ?: 'free');
        $active = ChatCostReservation::where('user_id', $user->id)
            ->whereIn('status', [
                ChatCostReservation::STATUS_PENDING,
                ChatCostReservation::STATUS_SETTLING,
            ])
            ->get()
            ->filter(fn (ChatCostReservation $reservation): bool => (
                ($reservation->meta['surface'] ?? null) === 'desktop-terminal'
            ))
            ->count();
        if ($active >= $limit) {
            throw new BillingReservationException(
                "Your Vibyra plan supports {$limit} concurrent terminal agent".
                    ($limit === 1 ? '' : 's').'. Wait for an active request to finish or upgrade.',
                429,
                'membership_agent_limit',
                ['maxConcurrentAgents' => $limit],
            );
        }
    }
}
