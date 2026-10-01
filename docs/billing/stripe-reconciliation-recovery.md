# Stripe reversal reconciliation

Won or warning-closed disputes delivered before the paid invoice could leave
`membership_orders.refund_pending` stuck after the grant was reconciled. A
subscription order can span several payment IDs, so clearing that flag for one
resolved dispute could also incorrectly release an unrelated pending refund.

The additive migration `2026_10_01_000002` records nullable `order_id` on verified
membership events. Apply it before the new webhook/replay code handles events.
It does not reset holds or infer ownership from stored payload metadata.

The existing scheduled `vibyra:membership-replay --limit=50` command retries
pending/failed events and processing events older than five minutes. While any
order is held, it also canonically rechecks old processed, unassociated refund
and dispute events to repair the deployed bug. Canonical Stripe reads identify
the order; successfully classified unrelated events become legacy and leave the
repair queue. All selection and hold checks use the configured Stripe
environment, so test backlog cannot block live funding.

Each associated event finalizes under the wallet → event → order lock order.
The order remains held while any associated pending/processing/failed reversal
exists. Unassociated unresolved financial events in the same environment keep
the check conservative until replay identifies their ownership. Resolving one
event never silently clears another event's hold. Replayed financial operations
retain existing cumulative-refund and unique-grant protections.

After deployment, run the bounded replay command and inspect its exit status;
failures remain retryable. A pre-upgrade held order without any attributable
verified financial event stays held for explicit operator reconciliation;
never blanket-reset `refund_pending`. A large or permanently failing oldest
backlog may require targeted operational reconciliation before later events
are reached. Provider API access is required to repair old events.

`StripeDisputeOrderingTest` covers original failure/recovery, different payment
IDs on one order, processing events, duplicate failures after success, old
failed and processed unassociated events, environment isolation, and a
deterministic read/update association race. The race test interleaves SQL on
one SQLite connection; it is not independent-worker PostgreSQL evidence.
