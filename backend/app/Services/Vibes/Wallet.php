<?php

namespace App\Services\Vibes;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Wallet
{
    /**
     * The account's wallet, created with its welcome grant the first time it is
     * asked for. `$trialCredits` is only ever passed when creating a guest, whose
     * grant is nothing when Apple says this device has already had one.
     *
     * The grant is written under `welcome:{user_id}`, and `grant()` ignores a
     * reference it has already used. That is what makes this safe to call on every
     * request, and — the part that matters — what stops a guest who signs up from
     * being handed a second trial on top of whatever is left of the first.
     */
    public function ensure(User $user, ?int $trialCredits = null): object
    {
        return DB::transaction(function () use ($user, $trialCredits) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $wallet = DB::table('vibes_wallets')->where('user_id', $user->id)->first();
            if ($wallet) return $wallet;
            DB::table('vibes_wallets')->insert([
                'user_id' => $user->id, 'account_token' => (string) Str::uuid(),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->grant($user->id, 'welcome:'.$user->id, 'trial',
                $trialCredits === null ? self::trialCredits() : max(0, $trialCredits));
            return $this->lock($user->id);
        }, 3);
    }

    /** Spendable Vibes, without building the whole payload. */
    public function available(int $userId): int
    {
        return (int) DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->sum('remaining');
    }

    /** The one free grant an account ever receives. Config owns it; nothing here does. */
    public static function trialCredits(): int
    {
        return max(0, (int) config('vibes.trial_credits'));
    }

    /** How many conversations that grant may be spread across. */
    public static function trialChats(): int
    {
        return max(1, (int) config('vibes.trial_chats'));
    }

    /**
     * The most of the trial grant any one conversation may draw. At or above
     * `trial_credits` this is inert and the grant itself is the only limit, which
     * is the shape a small trial wants: three Vibes split three ways is not a
     * trial of anything.
     */
    public static function trialChatCredits(): int
    {
        return max(0, (int) config('vibes.trial_chat_credits'));
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
        $windows = app(UsageWindows::class);

        return DB::transaction(function () use ($userId, $plans, $windows) {
            $w = $this->lock($userId);
            $user = User::findOrFail($userId);
            $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->get();
            $held = (int) DB::table('vibes_turns')->where('user_id', $userId)->whereNull('settled_at')->sum('reserved');
            $available = (int) $grants->sum('remaining');
            $paid = (int) $grants->where('kind', '!=', 'trial')->sum('remaining');
            $plan = $w->paid_until && now()->lt($w->paid_until) ? $w->plan : 'free';
            return [
                'version' => 1, 'available' => $available, 'held' => $held, 'total' => $available + $held,
                'chatEnabled' => (bool) config('vibes.enabled') && trim((string) config('services.openrouter.key')) !== '',
                'paidAvailable' => $paid, 'plan' => $plan, 'paidUntil' => $w->paid_until,
                'trialChatsRemaining' => max(0, self::trialChats() - DB::table('vibes_chats')->where('user_id', $userId)->whereNotNull('trial_slot')->count()),
                // Published so the phone words the trial from the same numbers the
                // backend enforces, instead of keeping its own copy of them.
                'trialCredits' => self::trialCredits(), 'trialChats' => self::trialChats(),
                'trialChatCredits' => self::trialChatCredits(),
                'accountToken' => $w->account_token, 'consented' => $w->consented_at !== null,
                // A guest has no address to verify, so it reports itself as one and
                // the phone stops asking. What replaced the email as its proof is
                // the DeviceCheck bit that decided its grant, which is spent before
                // the wallet exists and is not re-checked per request.
                'verified' => $user->hasVerifiedEmail(), 'guest' => $user->isGuest(),
                // Buying needs somewhere for the purchase to live if the phone is
                // lost, so it needs an account. The upgrade page says so.
                'purchasesEnabled' => !$user->isGuest() && (bool) (config('vibes.enabled') && config('vibes.purchases_enabled') && config('vibes.apple_private_key')
                    && config('vibes.apple_key_id') && config('vibes.apple_issuer')),
                'products' => collect(config('vibes.products'))->map(fn ($p, $id) => ['id' => $id, ...$p])->values()->all(),
                // Backend owns every entitlement number the upgrade screen shows.
                'entitlements' => $plans->for($plan),
                'planEntitlements' => $plans->all(),
                'remoteAccessLive' => $plans->remoteAccessLive(),
                'usedProjects' => $this->projectCount($userId),
                // How fast this plan may spend, measured the same way `Turns::submit`
                // refuses. The phone draws its meters from these and invents nothing.
                'limits' => $windows->payload($userId, $plan),
            ];
        });
    }
}
