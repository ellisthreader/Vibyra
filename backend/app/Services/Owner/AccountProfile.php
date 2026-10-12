<?php

namespace App\Services\Owner;

use App\Models\User;
use App\Services\Membership\{Entitlements, NewAccounts, Units};
use Illuminate\Support\Facades\DB;

/** Explicit read-only projection. Opening an account must never initialize its billing. */
final class AccountProfile
{
    public static function protected(User $user, int $actor): bool
    {
        return $user->id === $actor || in_array(strtolower($user->email), config('owner_analytics.emails', []), true)
            || $user->email === \App\Http\Middleware\LocalOwnerAccess::EMAIL;
    }

    public function for(User $user, int $actor, ?int $before = null): array
    {
        return DB::transaction(function () use ($user, $actor, $before) {
            $fresh = User::whereKey($user->id)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            return $this->snapshot($fresh, $actor, $before);
        }, 3);
    }

    private function snapshot(User $user, int $actor, ?int $before): array
    {
        $account = app(AccountDirectory::class)->query()->where('users.id', $user->id)->firstOrFail();
        $protected = self::protected($user, $actor);
        $wallet = DB::table('vibes_wallets')->where('user_id', $user->id)->lockForUpdate()->first();
        $balances = [];
        if ($wallet) {
            $modern = (int) $wallet->billing_version === 2;
            $available = DB::table('vibes_grants')->where('user_id', $user->id)->whereNull('revoked_at')
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->sum('remaining');
            $held = (int) DB::table('vibes_turns')->where('user_id', $user->id)->whereNull('settled_at')->sum('reserved')
                + \App\Services\CloudWorkspaces\Holds::units($user->id) + \App\Services\Assistant\Holds::units($user->id);
            $balances[] = ['type' => $modern ? 'tokens' : 'vibes', 'label' => $modern ? 'Tokens' : 'Legacy Vibes',
                'available' => (string) $available, 'held' => (string) $held, 'scale' => $modern ? Units::SCALE : 1];
        }
        if ((!$wallet || (int) $wallet->billing_version !== 2) && !NewAccounts::eligible($user)) {
            $balances[] = ['type' => 'credits', 'label' => 'Legacy credits',
                'available' => (string) (int) $user->credits_balance, 'held' => null, 'scale' => 1];
        }
        $history = DB::table('owner_account_actions')->where('user_id', $user->id)
            ->when($before, fn ($q) => $q->where('sequence', '<', $before))
            ->orderByDesc('sequence')->limit(26)->get();
        return ['ok' => true, 'account' => $account, 'membership' => app(Entitlements::class)->for($user),
            'balances' => $balances, 'capabilities' => ['protected' => $protected,
                'credit' => !$protected && !$user->isGuest() && !$user->owner_banned_at && count($balances) > 0,
                'warn' => !$protected && !$user->isGuest() && !$user->owner_banned_at,
                'ban' => !$protected && !$user->owner_banned_at, 'unban' => !$protected && (bool) $user->owner_banned_at],
            'history' => $history->take(25)->map(fn ($row) => ['id' => $row->id, 'sequence' => $row->sequence,
                'action' => $row->action, 'actor_id' => $row->actor_id, 'reason' => $row->reason,
                'message' => $row->message, 'result' => json_decode($row->result, true), 'created_at' => $row->created_at])->all(),
            'history_next' => $history->count() > 25 ? $history[24]->sequence : null];
    }
}
