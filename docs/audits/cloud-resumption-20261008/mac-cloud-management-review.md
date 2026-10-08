# Existing Cloud management admission

The only phone closes its Mac WebSocket when switching to Cloud. The original
Mac admission therefore hides Settings → Cloud while the phone asks the owner
to use its Allow button. The actual current phone WorkspaceStore/RpcClient
harness reproduces this failure against installed Mac92 admission.

The candidate separates initial setup from already authorized management.
Initial Connect retains its exact live trusted socket/account-epoch guard.
A strict admitted overview/setup can record management only when current
server Cloud consent is connected and this Mac's registered Host belongs to
the account. It derives the phone fingerprint from an original captured
approved socket, not from saved device presence alone.

The private atomic receipt stores a domain-separated SHA-256 account binding,
Host public key, phone public key, approval timestamp and random generation.
It never stores a bearer, welcomeKey or login artifact. Restored authentication
captures a fresh token/epoch and revalidates server consent, registered Host,
provider enablement and VM key before provider creation and sending. Nearby
LAN reapproval remains unchanged. Startup and status reads never open pages.

Removal, explicit disconnection, Phone-off, account logout/rejection and Cloud
disconnection revoke management. Phone-off clears before and after shutting
down the Host, fencing a concurrently admitted mint. Epoch/receipt/device
checks run under account authority; stale server responses cannot revoke a
replacement account's receipt. Storage damage fails closed. A failed write
revocation disables the current process; report the error and restore storage
before treating a later cold start as a proven persistent revocation.

The frontend receives only the native generation. Initial setup has a separate
live scope; existing management survives the single phone moving to Cloud.
All mutation and provider admission remains native. The switch harness uses a
fixture receipt to test rendering admission; actual minting/storage policy is
covered by twelve native focused tests. This is not live OAuth acceptance.

Root reviewed and approved the native management security and persistence
boundary against real server envelopes. Physical provider Allow/upload/Cloud project launch, cold restart,
revocation and protected signing/notarization remain separate delivery gates.

Conditional clear compares the exact receipt atomically while account authority
is held. Strict ineligible reads also verify the original live socket and the
receipt captured before the request. Both stale empty reads and same-account
replacement approval revocation now have passing focused regressions.
