<?php

namespace App\Services\Vibes;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Wallet
{
    public function ensure(User $user): object
    {
        return DB::transaction(function () use ($user) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $wallet = DB::table('vibes_wallets')->where('user_id', $user->id)->first();
            if ($wallet) return $wallet;
            DB::table('vibes_wallets')->insert([
                'user_id' => $user->id, 'account_token' => (string) Str::uuid(),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->grant($user->id, 'welcome:'.$user->id, 'trial', 100);
            return $this->lock($user->id);
        }, 3);
    }

    public function lock(int $userId): object
    {
        return DB::table('vibes_wallets')->where('user_id', $userId)->lockForUpdate()->firstOrFail();
    }

    // Call under the account wallet lock; unique reference is the replay boundary.
    public function grant(int $userId, string $reference, string $kind, int $amount): void
    {
        if (DB::table('vibes_grants')->where('reference', $reference)->exists()) return;
        DB::table('vibes_grants')->insert([
            'user_id' => $userId, 'reference' => $reference, 'kind' => $kind,
            'amount' => $amount, 'remaining' => $amount, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->record($userId, $reference, 'grant', $amount);
    }

    public function record(int $userId, string $reference, string $kind, int $delta, array $meta = []): void
    {
        DB::table('vibes_ledger')->insert([
            'user_id' => $userId, 'reference' => $reference, 'kind' => $kind,
            'delta' => $delta, 'metadata' => json_encode($meta, JSON_THROW_ON_ERROR), 'created_at' => now(),
        ]);
    }

    /** Current entitled plan; an expired paid period is always 'free'. */
    public function planFor(int $userId): string
    {
        $w = DB::table('vibes_wallets')->where('user_id', $userId)->first();
        return $w && $w->paid_until && now()->lt($w->paid_until) ? $w->plan : 'free';
    }

    /**
     * Distinct computer/project pairs this account has attached. Counted in PHP
     * because chats are already bounded per account and SQL string
     * concatenation is not portable across the SQLite and PostgreSQL targets.
     */
    public function projectCount(int $userId): int
    {
        return DB::table('vibes_chats')->where('user_id', $userId)->whereNotNull('project_id')
            ->get(['host_id', 'project_id'])->map(fn ($c) => $c->host_id.'/'.$c->project_id)->unique()->count();
    }

    public function payload(int $userId): array
    {
        $plans = app(Plans::class);

        return DB::transaction(function () use ($userId, $plans) {
            $w = $this->lock($userId);
            $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->get();
            $held = (int) DB::table('vibes_turns')->where('user_id', $userId)->whereNull('settled_at')->sum('reserved');
            $available = (int) $grants->sum('remaining');
            $paid = (int) $grants->where('kind', '!=', 'trial')->sum('remaining');
            $plan = $w->paid_until && now()->lt($w->paid_until) ? $w->plan : 'free';
            return [
                'version' => 1, 'available' => $available, 'held' => $held, 'total' => $available + $held,
                'chatEnabled' => (bool) config('vibes.enabled'),
                'paidAvailable' => $paid, 'plan' => $plan, 'paidUntil' => $w->paid_until,
                'trialChatsRemaining' => max(0, 2 - DB::table('vibes_chats')->where('user_id', $userId)->whereNotNull('trial_slot')->count()),
                'accountToken' => $w->account_token, 'consented' => $w->consented_at !== null,
                'verified' => User::findOrFail($userId)->hasVerifiedEmail(),
                'purchasesEnabled' => (bool) (config('vibes.enabled') && config('vibes.purchases_enabled') && config('vibes.apple_private_key')
                    && config('vibes.apple_key_id') && config('vibes.apple_issuer')),
                'products' => collect(config('vibes.products'))->map(fn ($p, $id) => ['id' => $id, ...$p])->values()->all(),
                // Backend owns every entitlement number the upgrade screen shows.
                'entitlements' => $plans->for($plan),
                'planEntitlements' => $plans->all(),
                'remoteAccessLive' => $plans->remoteAccessLive(),
                'usedProjects' => $this->projectCount($userId),
            ];
        });
    }
}
