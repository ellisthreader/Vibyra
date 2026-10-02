<?php

namespace App\Services\Membership\Licenses;

use App\Models\User;
use App\Services\Membership\{Entitlements, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class Redemption
{
    public function redeem(User $user, string $hash): array
    {
        abort_unless(config('licenses.enabled'), 503, 'License redemption is not available yet.');
        return DB::transaction(function () use ($user, $hash) {
            $u = User::whereKey($user->id)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            abort_unless(!$u->isGuest() && $u->hasVerifiedEmail(), 403, 'Verify your email before redeeming a license.');
            app(Wallet::class)->ensure($u);
            app(Wallet::class)->lock($u->id);
            abort_unless(Units::modern($u->id), 409, 'Contact support to reconcile your existing wallet before redeeming. Your key has not been used.');
            $l = DB::table('membership_licenses')->where('key_hash', $hash)->lockForUpdate()->first();
            abort_unless($l && !$l->revoked_at, 422, 'This license key is unavailable. Check it or contact its issuer.');
            if ($l->redeemed_at) {
                abort_unless($l->user_id == $u->id && now()->lt(Carbon::parse($l->ends_at)), 422, 'This license key is unavailable. Check it or contact its issuer.');
                return ['status' => 'redeemed', 'license' => app(Allowance::class)->summary($u->id)];
            }
            abort_if(now()->gte(Carbon::parse($l->claim_by)) || ($l->fixed_ends_at && now()->gte(Carbon::parse($l->fixed_ends_at))),
                422, 'This license key is unavailable. Check it or contact its issuer.');
            abort_if(app(Entitlements::class)->subscribed($u), 409, 'Wait until your paid membership ends before redeeming. Your key has not been used.');
            abort_if(DB::table('membership_licenses')->where('user_id', $u->id)->whereNull('revoked_at')->where('ends_at', '>', now())->exists(),
                409, 'You already have an active license. Your new key has not been used.');
            $subscriptions = array_keys(array_filter(config('membership.offers'), fn ($o) => $o['kind'] === 'subscription'));
            abort_if(DB::table('membership_orders')->where('user_id', $u->id)->whereIn('offer_key', $subscriptions)
                ->whereNull('fulfilled_at')->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->exists(),
                409, 'Finish or let your pending subscription checkout expire first. Your key has not been used.');
            $end = $l->fixed_ends_at ? Carbon::parse($l->fixed_ends_at) : now()->addMonthsNoOverflow($l->duration_months);
            DB::table('membership_licenses')->where('id', $l->id)->update([
                'user_id' => $u->id, 'redeemed_at' => now(), 'ends_at' => $end, 'updated_at' => now()]);
            DB::table('membership_periods')->where('user_id', $u->id)->where('provider', 'trial')->whereNull('revoked_at')
                ->update(['revoked_at' => now(), 'updated_at' => now()]);
            DB::table('membership_periods')->insert(['reference' => 'license:'.$l->id, 'user_id' => $u->id,
                'provider' => 'license', 'environment' => 'none', 'offer_key' => 'pro_license',
                'starts_at' => now(), 'ends_at' => $end, 'units' => 0, 'paid_minor' => 0, 'currency' => 'GBP',
                'created_at' => now(), 'updated_at' => now()]);
            app(Allowance::class)->refresh($u->id);
            Issuance::audit($l->id, $u->id, 'redeemed');
            return ['status' => 'redeemed', 'license' => app(Allowance::class)->summary($u->id)];
        }, 3);
    }
}
