<?php

namespace App\Services\Membership;

use Stripe\StripeClient;

/** Resolve payment links using the Invoice Payments API introduced in Basil. */
final class StripePayments
{
    public function invoiceIntent(object $invoice): string
    {
        if (!empty($invoice->payment_intent)) return (string) $invoice->payment_intent;
        $payments = $invoice->payments;
        abort_if($payments->has_more ?? false, 422, 'Invoice needs payment reconciliation.');
        $paid = array_values(array_filter($payments->data ?? [], fn ($p) => $p->status === 'paid'));
        // Checkout sells one fixed offer. Manual split/out-of-band payments need review.
        abort_unless(count($paid) === 1 && ($paid[0]->payment->type ?? null) === 'payment_intent'
            && (int) $paid[0]->amount_paid === (int) $invoice->amount_paid, 422, 'Invoice needs payment reconciliation.');
        return (string) $paid[0]->payment->payment_intent;
    }

    public function invoicesForIntent(StripeClient $stripe, string $intent): array
    {
        $links = $stripe->invoicePayments->all(['payment' => ['type' => 'payment_intent', 'payment_intent' => $intent], 'limit' => 100]);
        abort_if($links->has_more ?? false, 422, 'Payment needs invoice reconciliation.');
        return array_values(array_unique(array_map(fn ($p) => (string) $p->invoice, $links->data)));
    }
}
