<?php

namespace App\Console\Commands;

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
        $query = User::whereNotNull('plan_renews_at')->where('plan_renews_at', '<=', $now);
        $count = (clone $query)->count();
        $this->info("Refreshing {$count} user(s).");
        $dry = (bool) $this->option('dry-run');

        $query->cursor()->each(function (User $user) use ($deductor, $dry) {
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
}
