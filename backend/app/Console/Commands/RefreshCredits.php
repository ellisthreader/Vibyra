<?php

namespace App\Console\Commands;

use App\Models\IapReceipt;
use App\Models\MembershipCancellationFeedback;
use App\Models\User;
use App\Services\Billing\CreditDeductor;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class RefreshCredits extends Command
{
    protected $signature = 'vibyra:refresh-credits {--dry-run : Print what would happen without writing}';
    protected $description = 'Refresh monthly credit allowances for users whose plan_renews_at has passed.';

    public function handle(CreditDeductor $deductor): int
    {
        $now = Carbon::now();
        $this->endScheduledMemberships($deductor, $now, (bool) $this->option('dry-run'));
        $query = User::whereNotNull('plan_renews_at')->where('plan_renews_at', '<=', $now);
        $count = (clone $query)->count();
        $this->info("Refreshing {$count} user(s).");
        $dry = (bool) $this->option('dry-run');

        $query->cursor()->each(function (User $user) use ($deductor, $dry) {
            if ($this->expiredIapSubscription($user)) {
                $this->line("  user={$user->id} expired IAP subscription; reverting to free");
                if (! $dry) {
                    $user->forceFill([
                        'plan' => 'free',
                        'plan_billing_cycle' => 'monthly',
                        'plan_renews_at' => null,
                        'membership_ends_at' => null,
                        'membership_cancel_at_period_end' => false,
                        'billing_provider' => null,
                    ])->save();
                }
                return;
            }

            $plan = $user->plan ?: 'free';
            $cycle = $user->plan_billing_cycle ?: 'monthly';
            $config = (array) config("billing.plans.{$plan}", []);
            $allowance = (int) ($cycle === 'annual'
                ? ($config['annual_credits'] ?? $config['monthly_credits'] ?? 0)
                : ($config['monthly_credits'] ?? 0));

            $this->line("  user={$user->id} plan={$plan} cycle={$cycle} allowance={$allowance}");
            if ($dry) return;

            $deductor->refresh($user, $allowance, ['source' => 'cron.refresh-credits', 'plan' => $plan, 'cycle' => $cycle]);
        });

        return self::SUCCESS;
    }

    private function expiredIapSubscription(User $user): bool
    {
        if (! str_starts_with((string) $user->billing_provider, 'iap-')) {
            return false;
        }

        $receipt = IapReceipt::where('user_id', $user->id)
            ->whereNotNull('expires_at')
            ->latest('expires_at')
            ->first();

        return $receipt === null || $receipt->expires_at->isPast();
    }

    private function endScheduledMemberships(CreditDeductor $deductor, Carbon $now, bool $dry): void
    {
        User::where('membership_cancel_at_period_end', true)
            ->whereNotNull('membership_ends_at')
            ->where('membership_ends_at', '<=', $now)
            ->cursor()
            ->each(function (User $user) use ($deductor, $dry) {
                $this->line("  user={$user->id} paid term ended; reverting to free");
                if ($dry) return;
                $user->forceFill([
                    'plan' => 'free',
                    'plan_billing_cycle' => 'monthly',
                    'billing_provider' => null,
                    'stripe_customer_id' => null,
                    'stripe_subscription_id' => null,
                    'membership_ends_at' => null,
                    'membership_cancel_at_period_end' => false,
                ])->save();
                $deductor->refresh($user, (int) config('billing.plans.free.monthly_credits', 50), [
                    'source' => 'membership_period_ended',
                ]);
                $user->forceFill(['plan_renews_at' => null])->save();
                MembershipCancellationFeedback::where('user_id', $user->id)
                    ->where('status', 'scheduled')
                    ->latest('id')
                    ->first()
                    ?->forceFill(['status' => 'completed', 'completed_at' => now()])
                    ->save();
            });
    }
}
