---
title: HKE Stripe Terminal Timeout Reconciliation
date: 2026-07-16
tags:
  - hke
  - incident
  - checkout
  - payments
  - stripe-terminal
---

# HKE Stripe Terminal Timeout Reconciliation

## What Happened

The recovered professional-receipt and Stripe Terminal work passed its focused tests, but review found that a two-minute reader timeout returned control to the till without cancelling the active Stripe reader action. A cashier could retry while the S710 was still processing the previous PaymentIntent.

The same recovery also found an accidental UTF-8 BOM at the start of `.env.example`.

## User-Facing Path

Till/POS → collection order awaiting payment → **Pay Now** → **Card** → **Charge** → reader does not complete before the client timeout → cashier retries.

## Root Cause

`processStripeTerminalPayment` stopped polling when its local deadline elapsed, but did not cancel the exact reader action or reconcile the PaymentIntent one final time. The UI therefore treated a client timeout as a clean retry boundary even though Stripe could still be processing the original action.

The BOM came from an earlier text-write operation that preserved or introduced UTF-8 signature bytes.

## Misleading Checks

- A successful build did not prove the hardware retry boundary was safe.
- Passing receipt and order-settlement tests did not exercise the two-minute reader timeout.
- A client-side timeout did not mean the S710 or PaymentIntent had stopped.

## Fix Applied

- On timeout, cancel the action using the reader ID returned by the payment-start response.
- Re-read the PaymentIntent and reader status once after cancellation.
- Accept a payment that completed at the timeout boundary.
- Otherwise show a timeout message that tells staff to check the S710 before retrying.
- Remove the BOM from `.env.example`.

## Regression Guard

`scripts/check-checkout-regressions.mjs` now asserts that the Stripe timeout path:

- calls `cancelStripeTerminalAction(started.reader_id)`;
- performs a final status request; and
- returns a reconciled successful payment before allowing the timeout error.

## Verification

- `npm run build` — passed, including checkout, address-pin, language, TypeScript, and Vite checks.
- `php artisan test tests/Feature/Account/CustomerOrderTest.php tests/Unit/EpsonReceiptPrinterTest.php tests/Feature/DigitalReceiptTest.php` — 23 tests passed with 220 assertions.
- `git diff --check` — passed.
- `Format-Hex -Path .env.example` — begins with `APP_NAME`, with no UTF-8 BOM.

## Prevention Checklist

- [ ] Treat timeout, cancel, decline, duplicate callback, and retry as separate payment states.
- [ ] Cancel the exact reader action using the reader ID returned by Stripe.
- [ ] Reconcile PaymentIntent status before telling staff a retry is safe.
- [ ] Never infer hardware completion from a browser timer alone.
- [ ] Keep only receipt-safe card brand and last-four data.
- [ ] Run the checkout regression guard and focused payment/receipt tests.
- [ ] Verify text configuration files do not gain BOM bytes.

> [!important]
> Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.

