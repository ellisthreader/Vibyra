<?php

namespace App\Services\Membership;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Stripe\Event;
use Stripe\StripeClient;

/** Canonical reads make late events harmless. Paid invoices alone mint subscriptions. */
final class StripeEvents
{
    public function handle(Event $event, StripeClient $stripe): bool
    {
        $id = 'stripe:'.($event->livemode ? 'live:' : 'test:').$event->id;
        DB::table('membership_events')->insertOrIgnore(['id' => $id, 'type' => $event->type, 'status' => 'pending',
            'payload' => \Illuminate\Support\Facades\Crypt::encryptString($event->toJSON()), 'created_at' => now(), 'updated_at' => now()]);
        $row = DB::table('membership_events')->where('id', $id)->first();
        $reconciliation = app(StripeReconciliation::class);
        // Old processed reversals have no association; canonical replay repairs their stuck holds.
        $repair = !$row->order_id && ($row->type === 'charge.refunded' || str_starts_with($row->type, 'charge.dispute.'));
        if ($row->status === 'processed' && !$repair) return $reconciliation->finish($id, true);
        if ($row->status === 'legacy') return false;
        try {
            $handled = $this->apply($event, $stripe, $id);
            return $reconciliation->finish($id, $handled);
        } catch (\Throwable $e) {
            $reconciliation->fail($id);
            throw $e;
        }
    }
    private function apply(Event $event, StripeClient $stripe, string $eventId): bool
    {
        $o = $event->data->object;
        $type = (string) $event->type;
        $environment = $event->livemode ? 'live' : 'test';
        abort_unless($environment === config('membership.stripe_environment', 'live'), 422, 'Wrong Stripe environment.');
        if (str_starts_with($type, 'checkout.session.')) {
            $id = $o->metadata->membershipOrder ?? null;
            if (!$id) return false;
            $session = $stripe->checkout->sessions->retrieve($o->id, ['expand' => ['line_items']]);
            $order = $this->order($id, (string) $session->customer);
            if ($session->mode === 'payment' && $session->payment_status === 'paid') {
                $this->paid($order, $session->line_items->data ?? [], 'stripe:'.$environment.':checkout:'.$session->id,
                    $environment, null, (string) $session->payment_intent, (int) $session->amount_total,
                    (string) $session->currency, Carbon::createFromTimestamp($session->created), null);
            }
            return true;
        }
        if (str_starts_with($type, 'invoice.')) {
            $invoice = $stripe->invoices->retrieve($o->id, ['expand' => ['lines', 'payments']]);
            $subId = $invoice->subscription ?? $invoice->parent->subscription_details->subscription ?? null;
            if (!$subId) return false;
            $subscription = $stripe->subscriptions->retrieve($subId);
            $id = $subscription->metadata->membershipOrder ?? null;
            if (!$id) return false;
            $order = $this->order($id, (string) $invoice->customer);
            if ($invoice->status === 'paid' && $type === 'invoice.paid') {
                $lines = $invoice->lines->data ?? [];
                $line = collect($lines)->first(fn ($l) => $this->price($l) === $order->price_id);
                abort_unless($line && isset($line->period->start, $line->period->end), 422, 'Invoice has no contracted paid period.');
                $this->paid($order, $lines, 'stripe:'.$environment.':invoice:'.$invoice->id,
                    $environment, $subId, app(StripePayments::class)->invoiceIntent($invoice), (int) $invoice->amount_paid,
                    (string) $invoice->currency, Carbon::createFromTimestamp($line->period->start), Carbon::createFromTimestamp($line->period->end));
            }
            $this->lifecycle($subscription, $environment);
            return true;
        }
        if (str_starts_with($type, 'customer.subscription.')) {
            $s = $stripe->subscriptions->retrieve($o->id);
            if (!($s->metadata->membershipOrder ?? null)) return false;
            $this->order($s->metadata->membershipOrder, (string) $s->customer);
            $this->lifecycle($s, $environment);
            return true;
        }
        if ($type === 'charge.refunded' || str_starts_with($type, 'charge.dispute.')) {
            $chargeId = $type === 'charge.refunded' ? $o->id : $o->charge;
            $charge = $stripe->charges->retrieve($chargeId);
            $payment = (string) ($charge->payment_intent ?? '');
            $periods = $payment === '' ? collect() : DB::table('membership_periods')->where('provider', 'stripe')
                ->where('environment', $environment)->where('payment_id', $payment)->get();
            // Legacy API compatibility; current invoice payments are linked above at grant.
            if ($periods->isEmpty() && ($charge->invoice ?? null)) $periods = DB::table('membership_periods')
                ->where('reference', 'stripe:'.$environment.':invoice:'.$charge->invoice)->get();
            if ($periods->isEmpty()) {
                // A refund may arrive before its grant event. Keep our event retryable.
                if ($payment !== '') {
                    $intent = $stripe->paymentIntents->retrieve($payment);
                    $orderId = $intent->metadata->membershipOrder ?? null;
                    if ($orderId) $this->awaitPurchase($orderId, $eventId);
                }
                $invoiceIds = ($charge->invoice ?? null) ? [$charge->invoice]
                    : ($payment !== '' ? app(StripePayments::class)->invoicesForIntent($stripe, $payment) : []);
                foreach ($invoiceIds as $invoiceId) {
                    $invoice = $stripe->invoices->retrieve($invoiceId);
                    $sub = $invoice->subscription ?? $invoice->parent->subscription_details->subscription ?? null;
                    if ($sub) {
                        $subscription = $stripe->subscriptions->retrieve($sub);
                        if ($orderId = $subscription->metadata->membershipOrder ?? null) $this->awaitPurchase($orderId, $eventId);
                    }
                }
                return false;
            }
            $orders = $periods->pluck('order_id')->unique();
            abort_unless($orders->count() === 1 && $orders->first(), 409, 'Payment reversal needs an unambiguous order.');
            $reconciliation = app(StripeReconciliation::class);
            if (!$reconciliation->track($eventId, $orders->first())) return true;
            // A dispute is not proof of a refund. Restrict new funded work while reviewed.
            if ($type !== 'charge.refunded') {
                $status = $reconciliation->withWallet($periods->first()->user_id, function () use ($stripe, $o, $periods) {
                    $status = $stripe->disputes->retrieve($o->id)->status;
                    DB::table('membership_periods')->whereIn('reference', $periods->pluck('reference'))
                        ->update(['disputed' => !in_array($status, ['won', 'warning_closed'], true)]);
                    return $status;
                });
                // Keep Periods' durable refund-intent transaction outside the marking transaction.
                if ($status === 'lost') foreach ($periods as $p) app(Periods::class)->refund($p->reference, $p->paid_minor, true);
                return true;
            }
            foreach ($periods as $p) app(Periods::class)->refund($p->reference, (int) $charge->amount_refunded);
            return true;
        }
        return false;
    }

    private function awaitPurchase(string $orderId, string $eventId): void
    {
        if (app(StripeReconciliation::class)->track($eventId, $orderId)) {
            abort(503, 'Refund is waiting for its purchase reconciliation.');
        }
    }

    private function order(string $id, string $customer): object
    {
        $order = DB::table('membership_orders')->where('id', $id)->firstOrFail();
        abort_unless(hash_equals($order->customer_id, $customer), 409, 'Purchase account mismatch.');
        return $order;
    }
    private function price(object $line): ?string
    {
        return $line->price->id ?? $line->pricing->price_details->price ?? null;
    }
    private function paid(object $order, array $lines, string $ref, string $environment, ?string $subscription,
        string $payment, int $amount, string $currency, Carbon $start, ?Carbon $end): void
    {
        $offer = app(Offers::class)->get($order->offer_key, $order->offer_version);
        abort_unless(count($lines) === 1 && $this->price($lines[0]) === $order->price_id
            && (int) $lines[0]->quantity === 1, 422, 'Purchase line items do not match the offer.');
        abort_unless(strtoupper($currency) === 'GBP' && $amount >= $offer['pence'], 422, 'Payment is below the contracted offer.');
        abort_unless(($offer['kind'] === 'subscription') === ($end !== null), 422, 'Purchase interval mismatch.');
        app(Periods::class)->grant($order->user_id, ['reference' => $ref, 'order_id' => $order->id, 'provider' => 'stripe', 'environment' => $environment,
            'subscription_id' => $subscription, 'payment_id' => $payment, 'offer_key' => $order->offer_key,
            'starts_at' => $start, 'ends_at' => $end, 'units' => $offer['credits'] * Units::SCALE,
            'paid_minor' => $amount, 'currency' => strtoupper($currency)]);
    }
    private function lifecycle(object $s, string $environment): void
    {
        $query = DB::table('membership_periods')->where('provider', 'stripe')->where('environment', $environment)->where('subscription_id', $s->id);
        // Flexible billing's portal uses a future cancel_at while the legacy flag remains false.
        $scheduled = (bool) ($s->cancel_at_period_end ?? false) || (int) ($s->cancel_at ?? 0) > now()->timestamp;
        $update = ['cancel_at_end' => $scheduled, 'updated_at' => now()];
        // Failed renewal does not remove the period that was already purchased.
        if ($s->status === 'canceled' && ($s->ended_at ?? null)) {
            $query->where('ends_at', '>', Carbon::createFromTimestamp($s->ended_at));
            $update['ends_at'] = Carbon::createFromTimestamp($s->ended_at);
        }
        $query->update($update);
    }
}
