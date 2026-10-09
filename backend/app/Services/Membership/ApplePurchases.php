<?php

namespace App\Services\Membership;

use App\Services\Vibes\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class ApplePurchases
{
    public function apply(int $userId, array $t, array $offer): void
    {
        $w = app(Wallet::class)->lock($userId);
        abort_unless(strtolower($t['appAccountToken'] ?? '') === strtolower($w->account_token), 409, 'Purchase belongs to another account.');
        abort_unless(($t['inAppOwnershipType'] ?? '') === 'PURCHASED', 422, 'This purchase cannot be shared.');
        abort_unless(app(\App\Services\Vibes\AppleEnvironment::class)->allows($userId, $t['environment'] ?? ''), 422, 'Wrong purchase environment.');
        foreach (['transactionId', 'originalTransactionId', 'purchaseDate', 'price', 'currency'] as $key) {
            abort_unless(isset($t[$key]), 422, 'Apple purchase is missing '.$key.'.');
        }
        $subscription = $offer['kind'] === 'subscription';
        abort_if($subscription && !isset($t['expiresDate']), 422, 'Missing paid-through date.');
        $ref = 'apple:'.$t['environment'].':'.$t['transactionId'];
        app(Periods::class)->grant($userId, ['reference' => $ref, 'provider' => 'iap-apple',
            'environment' => $t['environment'], 'subscription_id' => $subscription ? $t['originalTransactionId'] : null,
            'payment_id' => $t['transactionId'], 'offer_key' => $offer['key'],
            'starts_at' => Carbon::createFromTimestampMs($t['purchaseDate']),
            'ends_at' => $subscription ? Carbon::createFromTimestampMs($t['expiresDate']) : null,
            'units' => $offer['credits'] * Units::SCALE,
            // Preserve Apple's thousandths exactly, including zero/three-decimal currencies.
            'money_scale' => 1000, 'paid_minor' => (int) $t['price'], 'currency' => strtoupper($t['currency'])]);
        if ($subscription && isset($t['verifiedRenewal'])) {
            $renewal = $t['verifiedRenewal'];
            DB::table('membership_periods')->where('provider', 'iap-apple')->where('environment', $t['environment'])
                ->where('subscription_id', $t['originalTransactionId'])
                ->where(fn ($q) => $q->whereNull('renewal_signed_at')->orWhere('renewal_signed_at', '<=', $renewal['signedDate']))
                ->update(['cancel_at_end' => $renewal['autoRenewStatus'] === 0, 'renewal_signed_at' => $renewal['signedDate'], 'updated_at' => now()]);
        }
        if (isset($t['revocationDate'])) {
            $p = DB::table('membership_periods')->where('reference', $ref)->firstOrFail();
            $partial = ($t['revocationType'] ?? '') === 'REFUND_PRORATED';
            $fraction = $partial ? min(100000, max(0, (int) ($t['revocationPercentage'] ?? 0))) : 100000;
            abort_if($partial && !$fraction, 503, 'Apple refund percentage is not available yet.');
            app(Periods::class)->refund($ref, (int) ceil($p->paid_minor * $fraction / 100000), !$partial);
        }
    }
}
