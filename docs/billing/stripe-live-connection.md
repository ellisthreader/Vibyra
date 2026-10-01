# Vibyra live Stripe connection

Current verification: 1 October 2026. Production sales remain disabled. Prices and owned return URLs are configured; the restricted key, webhook secret and portal configuration are not yet installed. The owner approved the following access. Key creation requires their fresh authenticator code; do not reuse a code from an earlier attempt or create duplicate keys after an ambiguous result.

Use account `acct_1S6RdCFpWKUenh5g`. Preserve the existing HKE destination; it belongs to another active project.

| Restricted key resource | Permission |
|---|---|
| Customers | Write |
| Customer Portal | Write |
| Checkout Sessions, exact child resource | Write |
| Charges and Refunds | Read |
| Payment Disputes | Read |
| Payment Intents | Read |
| Invoices | Read |
| Subscriptions | Read |
| Prices | Read |
| Products | Read |

All other resources remain None. The approved key name is `Vibyra Railway Production`. Do not grant payouts, bank management or live refund issuance. Transfer the key privately to `STRIPE_SECRET_KEY`; never put it in repository files or chat.

Create a separate Vibyra destination at `https://vibyra.net/api/billing/webhook`, API version `2026-08-26.dahlia`, for:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`
- `invoice.paid`, `invoice.payment_failed`
- `customer.subscription.updated`, `customer.subscription.deleted`
- `charge.refunded`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
- `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`

Transfer its signing secret privately to `STRIPE_WEBHOOK_SECRET`. Configure a dedicated portal with cancellation at period end, no prorations or subscription/quantity switching, payment-method update and invoice history. Use owned terms/privacy URLs and `https://vibyra.net/account` as return URL. Save its ID in `STRIPE_MEMBERSHIP_PORTAL_CONFIGURATION`.

Railway target: project `4e292f83-b6e3-4556-a1db-69a39a2be3b2`, production environment `8d678e46-a6f9-43a7-b192-3da614d82471`, Vibyra service `17d27bf4-6506-4545-93e3-221065d921b0`. Inspect staged variable names before committing with skipDeploys; preserve release metadata and unrelated service values. Deploy once and read effective readiness without exposing secrets.

Verify actual restricted-key permission on `GET /v1/invoice_payments` with `payment[type]=payment_intent`, a fresh impossible synthetic payment-intent ID and limit1. An empty200 establishes endpoint access without reading unrelated customer records; a403 is a permission blocker. Do not invent a separate Dashboard scope or broaden permissions without reviewing the provider's actual requirement.

Keep `LEGAL_PAID_SALES_ENABLED`, `MEMBERSHIP_V2_ENABLED` and `MEMBERSHIP_STRIPE_ENABLED` false until the remaining real sandbox lifecycle checks pass. `MEMBERSHIP_NEW_ACCOUNTS_FROM` is not set; define the intended new-account rollout at activation without silently converting existing legacy accounts. Use [sandbox acceptance](stripe-sandbox-acceptance.md) and its current evidence for the unresolved dispute outcomes, natural renewals and failed renewals. Configuration readiness alone does not establish payment acceptance.
