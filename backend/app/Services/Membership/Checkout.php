<?php

namespace App\Services\Membership;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Stripe\StripeClient;

final class Checkout
{
    public function create(User $user, array $input, StripeClient $stripe): string
    {
        $offer = app(Offers::class)->get($input['offerKey'], $input['offerVersion']);
        abort_unless(config('membership.enabled') && config('membership.stripe_enabled') && config('membership.stripe_portal_configuration') && $offer['stripe'], 503, 'This offer is not on sale yet.');
        abort_unless(Units::modern($user->id), 409, 'This account still has its original billing terms. Contact support to move to the new membership.');
        abort_unless($user->hasVerifiedEmail() && !$user->isGuest(), 403, 'Verify your account before purchasing.');
        if (!empty($input['accountScope'])) {
            $scope = DB::table('vibes_wallets')->where('user_id', $user->id)->value('account_token');
            abort_unless(hash_equals((string) $scope, $input['accountScope']), 409, 'Sign in with the account that opened this purchase.');
        }
        $order = DB::transaction(function () use ($user, $input, $stripe, $offer) {
            $u = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            app(\App\Services\Vibes\Wallet::class)->lock($u->id);
            $order = DB::table('membership_orders')->where('id', $input['requestId'])->first();
            abort_if($order && ($order->user_id != $u->id || $order->offer_key !== $input['offerKey'] || $order->offer_version !== $input['offerVersion']), 409, 'Purchase request was already used.');
            if (!$order) {
                if ($offer['kind'] === 'subscription') abort_if(app(Entitlements::class)->for($u)['tier'] !== 'free', 409, 'Manage your current subscription before buying another.');
                $order = DB::table('membership_orders')->where('user_id', $u->id)->where('offer_key', $input['offerKey'])
                    ->whereNull('fulfilled_at')->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->first();
            }
            if ($order?->checkout_url && now()->lt($order->expires_at)) return $order;
            abort_if($order && $order->expires_at && now()->gte($order->expires_at), 409, 'This checkout expired. Start a new purchase.');
            if (!$u->stripe_customer_id) {
                $customer = $stripe->customers->create(['email' => $u->email, 'name' => $u->name,
                    'metadata' => ['userId' => (string) $u->id]], ['idempotency_key' => 'membership-customer:'.$u->id]);
                $u->forceFill(['stripe_customer_id' => $customer->id])->save();
            }
            if (!$order) {
                DB::table('membership_orders')->insert(['id' => $input['requestId'], 'user_id' => $u->id,
                    'offer_key' => $input['offerKey'], 'offer_version' => $input['offerVersion'],
                    'price_id' => $offer['stripe'], 'customer_id' => $u->stripe_customer_id,
                    'created_at' => now(), 'updated_at' => now()]);
                $order = DB::table('membership_orders')->where('id', $input['requestId'])->first();
            }
            return $order;
        }, 3);
        if ($order->checkout_url) return $order->checkout_url;
        $meta = ['membershipOrder' => $order->id];
        $success = config('services.stripe.success_url');
        $success .= (str_contains($success, '?') ? '&' : '?').'order='.$order->id;
        $session = $stripe->checkout->sessions->create([
            'mode' => $offer['kind'] === 'subscription' ? 'subscription' : 'payment',
            'customer' => $order->customer_id, 'line_items' => [['price' => $order->price_id, 'quantity' => 1]],
            'success_url' => $success, 'cancel_url' => config('services.stripe.cancel_url'), 'metadata' => $meta,
            ($offer['kind'] === 'subscription' ? 'subscription_data' : 'payment_intent_data') => ['metadata' => $meta],
            'allow_promotion_codes' => false,
        ], ['idempotency_key' => 'membership-checkout:'.$order->id]);
        DB::table('membership_orders')->where('id', $order->id)->update(['session_id' => $session->id,
            'checkout_url' => $session->url, 'expires_at' => \Illuminate\Support\Carbon::createFromTimestamp($session->expires_at), 'updated_at' => now()]);
        return $session->url;
    }
}
