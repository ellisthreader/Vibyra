<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Vibes\Wallet;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Hand accounts a Vibes plan by hand, the way an App Store purchase would, so a
 * tester can reach every model without buying anything. It writes the wallet the
 * same way `Purchases::apply()` does and grants the plan's monthly Vibes under a
 * reference that is unique per account and period, so running it twice on the
 * same day tops nobody up twice.
 */
class GrantVibesPlan extends Command
{
    protected $signature = 'vibyra:grant-vibes-plan
        {plan=pro : free, starter, builder or pro}
        {--all : Every account, guests included}
        {--email=* : Only these accounts}
        {--days=30 : How long the paid period lasts from now}
        {--verify-email : Also mark unverified accounts as verified, since the phone will not send otherwise}
        {--dry-run : Show who would change without writing anything}';

    protected $description = 'Give accounts a Vibes plan and its monthly credits without a store purchase';

    public function handle(Wallet $wallet): int
    {
        $plan = strtolower(trim((string) $this->argument('plan')));
        $product = collect(config('vibes.products'))
            ->first(fn ($p) => ($p['kind'] ?? '') === 'subscription' && ($p['plan'] ?? '') === $plan);
        if ($plan !== 'free' && ! $product) {
            $this->error("Unknown plan '{$plan}'.");
            return self::FAILURE;
        }
        $emails = array_map('strtolower', array_map('trim', (array) $this->option('email')));
        if (! $this->option('all') && ! $emails) {
            $this->error('Pass --all or at least one --email.');
            return self::FAILURE;
        }
        $days = max(1, (int) $this->option('days'));
        $until = now()->addDays($days);
        $credits = (int) ($product['credits'] ?? 0);
        $dry = (bool) $this->option('dry-run');
        $verify = (bool) $this->option('verify-email');

        $query = User::query()->orderBy('id');
        if ($emails) $query->whereIn(DB::raw('lower(email)'), $emails);
        $users = $query->get();
        if ($emails && $users->count() !== count($emails)) {
            $missing = array_diff($emails, $users->pluck('email')->map(fn ($e) => strtolower((string) $e))->all());
            $this->error('No account for: '.implode(', ', $missing));
            return self::FAILURE;
        }

        foreach ($users as $user) {
            $reference = sprintf('manual:%s:%d:%s', $plan, $user->id, now()->toDateString());
            $label = $user->email ?: ($user->isGuest() ? 'guest' : 'no email');
            $verifying = $verify && ! $user->isGuest() && ! $user->hasVerifiedEmail();
            $this->line(sprintf('%s#%d %s -> %s until %s, +%d Vibes%s', $dry ? '[dry] ' : '', $user->id, $label,
                $plan, $until->toDateString(), $plan === 'free' ? 0 : $credits, $verifying ? ', email verified' : ''));
            if ($dry) continue;
            DB::transaction(function () use ($wallet, $user, $plan, $until, $credits, $reference, $verifying) {
                if ($verifying) $user->forceFill(['email_verified_at' => now()])->save();
                $wallet->ensure($user);
                $wallet->lock($user->id);
                DB::table('vibes_wallets')->where('user_id', $user->id)->update([
                    'plan' => $plan, 'paid_until' => $plan === 'free' ? null : $until, 'updated_at' => now(),
                ]);
                if ($plan !== 'free' && $credits > 0) $wallet->grant($user->id, $reference, 'subscription', $credits);
            }, 3);
        }
        $this->info(sprintf('%s %d account(s) to %s.', $dry ? 'Would move' : 'Moved', $users->count(), $plan));
        return self::SUCCESS;
    }
}
