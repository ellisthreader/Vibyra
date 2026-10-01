<?php

namespace App\Services\Membership;

use App\Models\User;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

/**
 * An operator-given Pro period. It is an ordinary membership period (so entitlements, plan limits and token
 * metering need no special case) under provider `complimentary` with no subscription, payment or price, so it can never be
 * mistaken for, renewed by, or refunded through Stripe or the App Store. At most one active at a time.
 */
final class ComplimentaryGrant
{
    public const PROVIDER = 'complimentary';
    public const OFFER = 'pro_complimentary';

    /** Read-only description of what a grant would do (or why it cannot). */
    public function plan(User $user, int $days, ?int $tokens): array
    {
        $now = now();
        $periods = DB::table('membership_periods')->where('user_id', $user->id)->whereNull('revoked_at')->where('disputed', false)
            ->where('starts_at', '<=', $now)->where('ends_at', '>', $now)->get();
        $wallet = DB::table('vibes_wallets')->where('user_id', $user->id)->first();
        $months = max(1, (int) round($days / 30.4375));
        $units = ($tokens ?? (int) config('membership.offers.pro_monthly.credits') * $months) * Units::SCALE;
        $out = ['userId' => (int) $user->id, 'days' => $days, 'units' => $units, 'tokens' => $units / Units::SCALE,
            'walletModern' => (bool) ($wallet && $wallet->billing_version == 2), 'refusal' => null, 'existing' => null,
            'endsAt' => $now->copy()->addDays($days)->toIso8601String()];
        if ($user->isGuest()) $out['refusal'] = 'guest_account';
        elseif ($active = $periods->firstWhere('provider', self::PROVIDER)) {
            $out['refusal'] = 'already_granted'; $out['existing'] = $active->ends_at;
        } elseif ($paid = $periods->first(fn ($p) => $p->provider !== 'trial')) {
            $out['refusal'] = 'paid_membership_active'; $out['existing'] = $paid->provider.' until '.$paid->ends_at;
        }
        return $out;
    }

    /** @param bool $migrate move a legacy (v1) wallet to tokens first, exactly as the operator Enrollment does. */
    public function apply(User $user, int $days, ?int $tokens, string $note, bool $migrate): array
    {
        $plan = $this->plan($user, $days, $tokens);
        if ($plan['refusal']) return $plan;
        if (! $plan['walletModern']) {
            if (! $migrate) { $plan['refusal'] = 'legacy_wallet_needs_migration'; return $plan; }
            app(Wallet::class)->ensure($user);
            app(Enrollment::class)->migrate($user, (int) $user->fresh()->credits_balance);
        }
        $start = now();
        $reference = self::PROVIDER.':'.$user->id.':'.$start->format('YmdHis');
        app(Periods::class)->grant($user->id, ['reference' => $reference, 'provider' => self::PROVIDER, 'environment' => 'none',
            'offer_key' => self::OFFER, 'starts_at' => $start->copy()->subMinute(), 'ends_at' => $start->copy()->addDays($days),
            'units' => $plan['units'], 'money_scale' => 100, 'paid_minor' => 0, 'currency' => 'GBP']);
        DB::table('membership_events')->insertOrIgnore(['id' => 'audit:'.$reference, 'status' => 'processed', 'type' => 'complimentary.grant',
            'payload' => json_encode(['userId' => $user->id, 'days' => $days, 'units' => $plan['units'], 'note' => mb_substr($note, 0, 200),
                'operator' => get_current_user().'@'.gethostname(), 'reference' => $reference], JSON_THROW_ON_ERROR),
            'error' => null, 'created_at' => now(), 'updated_at' => now()]);
        return $plan + ['reference' => $reference];
    }

    /** The resulting state, as the app will see it. */
    public function state(User $user): array
    {
        $e = app(Entitlements::class)->for($user->fresh());
        return ['plan' => $e['plan'], 'tier' => $e['tier'], 'provider' => $e['provider'], 'paidUntil' => (string) ($e['paidUntil'] ?? ''),
            'availableTokens' => Units::modern($user->id)
                ? round((int) DB::table('vibes_grants')->where('user_id', $user->id)->whereNull('revoked_at')->sum('remaining') / Units::SCALE, 2) : 0];
    }
}
