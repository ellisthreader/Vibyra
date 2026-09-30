<?php

namespace App\Services\Vibes;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class Purchases
{
    public function __construct(private readonly Wallet $wallet) {}

    // Accept only the authoritative result from AppleStore, never decoded client claims.
    public function apply(int $userId, array $t): void
    {
        DB::transaction(function () use ($userId, $t) {
            $w = $this->wallet->lock($userId);
            $product = config('vibes.products')[$t['productId'] ?? ''] ?? null;
            abort_unless($product && isset($t['transactionId'], $t['originalTransactionId'], $t['purchaseDate']), 422, 'Unknown Apple product.');
            abort_unless(strtolower($t['appAccountToken'] ?? '') === strtolower($w->account_token), 409, 'This purchase belongs to another Vibyra account.');
            abort_unless(($t['inAppOwnershipType'] ?? '') === 'PURCHASED', 422, 'This credit purchase cannot be shared.');
            $owned = DB::table('vibes_purchases')->where('original_id', $t['originalTransactionId'])->first();
            abort_if($owned && $owned->user_id != $userId, 409, 'Purchase is already assigned to another account.');
            $existing = DB::table('vibes_purchases')->where('transaction_id', $t['transactionId'])->first();
            abort_if($existing && ($existing->user_id != $userId || $existing->product_id !== $t['productId']), 409);
            $expires = isset($t['expiresDate']) ? Carbon::createFromTimestampMs($t['expiresDate']) : null;
            $purchased = Carbon::createFromTimestampMs($t['purchaseDate']);
            abort_if($product['kind'] === 'subscription' && !$expires, 422, 'Missing subscription expiry.');
            $ref = 'apple:'.$t['transactionId'];
            if (!$existing) {
                // Plan changes within an overlapping paid period add only the
                // allowance difference. Out-of-order delivery uses the same cap.
                $overlap = $expires ? (int) DB::table('vibes_purchases')->where('user_id', $userId)
                    ->where('original_id', $t['originalTransactionId'])->whereNull('revoked_at')
                    ->where('expires_at', '>', $purchased)->where('purchased_at', '<', $expires)->sum('granted_credits') : 0;
                $credits = isset($t['revocationDate']) ? 0 : max(0, $product['credits'] - $overlap);
                DB::table('vibes_purchases')->insert([
                    'transaction_id' => $t['transactionId'], 'original_id' => $t['originalTransactionId'],
                    'user_id' => $userId, 'product_id' => $t['productId'], 'expires_at' => $expires, 'created_at' => now(),
                    'purchased_at' => $purchased, 'granted_credits' => $credits,
                ]);
                // Historical purchases retain their paid credits, even if the subscription has ended.
                if ($credits > 0) $this->wallet->grant($userId, $ref, $product['kind'], $credits);
            }
            if (isset($t['revocationDate'])) {
                $grant = DB::table('vibes_grants')->where('reference', $ref)->first();
                if ($grant && !$grant->revoked_at) {
                    DB::table('vibes_grants')->where('id', $grant->id)->update(['remaining' => 0, 'revoked_at' => now()]);
                    $this->wallet->record($userId, 'refund:'.$ref, 'refund', -$grant->remaining);
                }
                DB::table('vibes_purchases')->where('transaction_id', $t['transactionId'])->update(['revoked_at' => now()]);
            }
            // Recompute from all verified transactions so late/out-of-order events cannot resurrect plans.
            $active = DB::table('vibes_purchases')->where('user_id', $userId)->whereNull('revoked_at')
                ->where('expires_at', '>', now())->orderByDesc('expires_at')->orderByDesc('granted_credits')->first();
            DB::table('vibes_wallets')->where('user_id', $userId)->update([
                'plan' => $active ? config('vibes.products')[$active->product_id]['plan'] : 'free',
                'paid_until' => $active?->expires_at, 'updated_at' => now(),
            ]);
        }, 5);
    }
}
