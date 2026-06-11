<?php

namespace Tests\Feature;

use App\Models\ChatCostReservation;
use App\Models\User;
use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ChatCostReservationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_reserves_and_settles_actual_usage_atomically(): void
    {
        $user = $this->user();
        $service = app(ChatCostReservationService::class);

        $reservation = $service->reserve($user, 'chat:one', 'gpt-5.4-mini', 10, 100_000);
        $this->assertSame(90, $user->fresh()->credits_balance);
        $this->assertSame(100_000, $user->fresh()->openrouter_reserved_micro_usd);

        $ledger = $service->settle($reservation, [[
            'billable' => true,
            'outcome' => 'completed',
            'usage' => ['prompt_tokens' => 100, 'completion_tokens' => 50, 'cost' => 0.02],
        ]]);

        $fresh = $user->fresh();
        $this->assertSame(-2, $ledger->credits_delta);
        $this->assertSame(98, $fresh->credits_balance);
        $this->assertSame(2, $fresh->credits_used);
        $this->assertSame(0, $fresh->openrouter_reserved_micro_usd);
        $this->assertSame(20_000, $fresh->openrouter_spent_micro_usd);
        $this->assertSame(ChatCostReservation::STATUS_SETTLED, $reservation->fresh()->status);

        $duplicate = $service->settle($reservation, [[
            'billable' => true,
            'usage' => ['prompt_tokens' => 999, 'completion_tokens' => 999, 'cost' => 9.99],
        ]]);
        $this->assertSame($ledger->id, $duplicate->id);
        $this->assertSame(98, $user->fresh()->credits_balance);
    }

    public function test_retry_attempts_are_all_charged_in_one_ledger_entry(): void
    {
        $user = $this->user();
        $service = app(ChatCostReservationService::class);
        $reservation = $service->reserve($user, 'chat:retry', 'gpt-5.4-mini', 10, 100_000);

        $ledger = $service->settle($reservation, [
            ['billable' => true, 'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5, 'cost' => 0.01]],
            ['billable' => true, 'usage' => ['prompt_tokens' => 12, 'completion_tokens' => 6, 'cost' => 0.02]],
        ]);

        $this->assertSame(-3, $ledger->credits_delta);
        $this->assertSame(97, $user->fresh()->credits_balance);
        $this->assertCount(2, $ledger->meta['attempts']);
        $this->assertSame(1, DB::table('credit_ledger')->where('reference', 'chat:retry')->count());
    }

    public function test_actual_cost_above_reservation_is_recorded_as_debt(): void
    {
        $user = $this->user(['credits_balance' => 1]);
        $service = app(ChatCostReservationService::class);
        $reservation = $service->reserve($user, 'chat:debt', 'gpt-5.4-mini', 1, 1_000);

        $ledger = $service->settle($reservation, [[
            'billable' => true,
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 10, 'cost' => 0.05],
        ]]);

        $this->assertSame(-5, $ledger->credits_delta);
        $this->assertSame(-4, $user->fresh()->credits_balance);
        $this->assertSame(-4, $ledger->credits_balance_after);
    }

    public function test_release_refunds_reserved_balance_and_quota(): void
    {
        $user = $this->user();
        $service = app(ChatCostReservationService::class);
        $reservation = $service->reserve($user, 'chat:release', 'gpt-5.4-mini', 3, 10_000);

        $service->release($reservation, 'not_dispatched');

        $fresh = $user->fresh();
        $this->assertSame(100, $fresh->credits_balance);
        $this->assertSame(0, $fresh->daily_credits_used);
        $this->assertSame(0, $fresh->openrouter_reserved_micro_usd);
        $this->assertSame(ChatCostReservation::STATUS_RELEASED, $reservation->fresh()->status);
    }

    public function test_terminal_agent_limit_is_transactional_and_releases_capacity(): void
    {
        $user = $this->user(['plan' => 'starter']);
        $service = app(ChatCostReservationService::class);
        $first = $service->reserve(
            $user,
            'terminal:first',
            'gpt-5.4-mini',
            1,
            1_000,
            ['surface' => 'desktop-terminal', 'agent_mode' => true],
        );

        try {
            $service->reserve(
                $user,
                'terminal:second',
                'gpt-5.4-mini',
                1,
                1_000,
                ['surface' => 'desktop-terminal', 'agent_mode' => true],
            );
            $this->fail('Expected the concurrent terminal membership limit to fail.');
        } catch (BillingReservationException $error) {
            $this->assertSame(429, $error->status);
            $this->assertSame('membership_agent_limit', $error->errorCode);
            $this->assertSame(1, $error->details['maxConcurrentAgents']);
        }

        $service->release($first, 'test_complete');
        $second = $service->reserve(
            $user,
            'terminal:second',
            'gpt-5.4-mini',
            1,
            1_000,
            ['surface' => 'desktop-terminal', 'agent_mode' => true],
        );
        $this->assertSame(ChatCostReservation::STATUS_PENDING, $second->status);
    }

    public function test_terminal_reservation_can_hold_more_balance_than_burst_quota(): void
    {
        $user = $this->user([
            'plan' => 'free',
            'credits_balance' => 24,
            'burst_credits_used' => 12,
            'burst_credits_reset_at' => now()->addHours(2),
            'weekly_credits_used' => 12,
            'weekly_credits_reset_at' => now()->addDays(6),
        ]);
        $service = app(ChatCostReservationService::class);
        $reservation = $service->reserve(
            $user,
            'terminal:realistic-quota',
            'google/gemini-3.5-flash',
            7,
            55_000,
            ['agent_mode' => true],
            3,
        );

        $reserved = $user->fresh();
        $this->assertSame(17, $reserved->credits_balance);
        $this->assertSame(15, $reserved->burst_credits_used);
        $this->assertSame(3, $reservation->meta['quota_reserved_credits']);

        $service->settle($reservation, [[
            'billable' => true,
            'outcome' => 'completed',
            'usage' => [
                'prompt_tokens' => 12_500,
                'completion_tokens' => 100,
                'cost' => 0.02,
            ],
        ]]);

        $settled = $user->fresh();
        $this->assertSame(21, $settled->credits_balance);
        $this->assertSame(15, $settled->burst_credits_used);
    }

    public function test_monthly_cost_limit_is_enforced_before_dispatch(): void
    {
        $user = $this->user([
            'plan' => 'free',
            'credits_balance' => 100,
            'openrouter_spend_period' => now('UTC')->format('Y-m'),
            'openrouter_spent_micro_usd' => 450_000,
        ]);

        try {
            app(ChatCostReservationService::class)
                ->reserve($user, 'chat:cap', 'gpt-5.4-mini', 1, 60_000);
            $this->fail('Expected the monthly cap reservation to fail.');
        } catch (BillingReservationException $error) {
            $this->assertSame('billing_monthly_usd_cap', $error->errorCode);
        }

        $this->assertDatabaseMissing('chat_cost_reservations', ['reference' => 'chat:cap']);
        $this->assertSame(100, $user->fresh()->credits_balance);
    }

    public function test_free_plan_can_continue_after_five_credits_within_its_burst_window(): void
    {
        $user = $this->user([
            'plan' => 'free',
            'credits_balance' => 45,
            'burst_credits_used' => 5,
            'burst_credits_reset_at' => now()->addHours(2),
            'weekly_credits_used' => 5,
            'weekly_credits_reset_at' => now()->addDays(6),
        ]);

        $reservation = app(ChatCostReservationService::class)
            ->reserve($user, 'chat:free-terminal', 'gpt-5.4-mini', 1, 1_000);

        $fresh = $user->fresh();
        $this->assertSame(6, $fresh->burst_credits_used);
        $this->assertSame(6, $fresh->weekly_credits_used);
        $this->assertSame(ChatCostReservation::STATUS_PENDING, $reservation->status);
    }

    public function test_burst_limit_failure_reports_the_exact_window(): void
    {
        $resetAt = now()->addHours(2)->startOfSecond();
        $user = $this->user([
            'plan' => 'free',
            'credits_balance' => 37,
            'burst_credits_used' => 13,
            'burst_credits_reset_at' => $resetAt,
            'weekly_credits_used' => 13,
            'weekly_credits_reset_at' => now()->addDays(6),
        ]);

        try {
            app(ChatCostReservationService::class)
                ->reserve($user, 'chat:burst-cap', 'gpt-5.4-mini', 3, 20_000);
            $this->fail('Expected the burst cap reservation to fail.');
        } catch (BillingReservationException $error) {
            $this->assertSame(429, $error->status);
            $this->assertSame('billing_burst_cap', $error->errorCode);
            $this->assertSame(13, $error->details['creditsUsed']);
            $this->assertSame(15, $error->details['creditsCap']);
            $this->assertSame(3, $error->details['estimatedCredits']);
            $this->assertSame($resetAt->toIso8601String(), $error->details['resetAt']);
        }
    }

    public function test_stale_dispatched_reservation_charges_reserved_estimate(): void
    {
        $user = $this->user();
        $service = app(ChatCostReservationService::class);
        $reservation = $service->reserve($user, 'chat:stale', 'gpt-5.4-mini', 4, 80_000);
        $reservation->forceFill([
            'provider_started_at' => now()->subHour(),
            'expires_at' => now()->subMinute(),
        ])->save();

        $result = $service->recoverStale();

        $this->assertSame(['released' => 0, 'settled' => 1], $result);
        $this->assertSame(96, $user->fresh()->credits_balance);
        $this->assertSame(80_000, $user->fresh()->openrouter_spent_micro_usd);
        $this->assertSame(ChatCostReservation::STATUS_SETTLED, $reservation->fresh()->status);
    }

    private function user(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'plan' => 'starter',
            'credits_balance' => 100,
            'credits_used' => 0,
            'daily_credits_used' => 0,
            'burst_credits_used' => 0,
            'weekly_credits_used' => 0,
            'openrouter_reserved_micro_usd' => 0,
            'openrouter_spent_micro_usd' => 0,
            'openrouter_spend_period' => now('UTC')->format('Y-m'),
        ], $overrides));
    }
}
