# Cloud Mac CI review candidate

Version 0.8.23 starts from the verified installed source manifest and
preserves the installed build92 Cloud, Agent Stage2 and Integrations.
It additionally fixes the single-phone Cloud management deadlock; a new
local build identifier is required before physical acceptance. The isolated branch retains
compatible committed CI workflows and the matching mobile lockfile. Its
source is separate from the installed app, production API and public update.

The installed snapshot omitted root CI support and the mobile lockfile. It
also lacked a current-version changelog/art entry. CI admission adds those
release records, documents actual manual fixture entry points for Knip,
removes two unused export modifiers and applies the pinned Rust formatter.
These admission changes preserve the product controls. Dependency overrides
also bring in upstream security fixes.

Required delivery gates remain exact-source full verification, successful
protected arm64 and x64 CI, notarization and updater signatures for admitted
bytes, public feed/download verification and real provider/native acceptance.
Keep the release private until the root audit's live acceptance is complete.

The compatible two-architecture workflow retains every gate and raises its
90-minute allowance to 120 minutes for cold optimized Intel linking. Only
completed successful exact-source runs admit artifacts; cancelled or failed
runs remain ineligible.

Dependency maintenance changes only five locked versions: source-map-js and
smol-toml on Desktop; shell-quote, source-map-js and brace-expansion in the
shared mobile graph. Fresh private npm ci, typecheck, Knip and the 704 passing
frontend tests pass. The registry reports no Desktop/relay advisories. Shared
mobile retains 16 high entries from the unpatched braces/node-forge roots;
these are advisory findings, not demonstrated application exploits. No physical
phone rebuild or major framework port is included in this CI admission.

Manual full verification needs all three locked dependency trees: Desktop,
shared mobile and host/relay. The retained CI workflow already installs all
three. An initial manual run omitted the relay tree and failed the unchanged
Preview WebSocket fixture on missing ws; this was setup, not product behavior.

See mac-cloud-management-review.md for the new native receipt boundary.
The final full verification log must cover that exact source. Old passing
checks, the installed build92 and a fixture phone switch do not prove live
provider Allow or a signed release.

Final verification passed with CARGO_INCREMENTAL=0 and RUST_TEST_THREADS=4:
core 240, desktop 737, updater 2, sync 5 unit/5 guardrail/7 smoke tests pass;
2 core and 16 desktop tests retain their existing ignored status. All native
gates passed with -D warnings. Four-thread test scheduling avoided an earlier
unchanged openpty resource failure without omitting tests. Final frontend-only
receipt continuity refinement passed 704 tests (1 existing skip), typecheck,
Knip, the 200-line gate and production build; native source was unchanged.

The final candidate is 0.8.23/build94. It adds atomic matching revocation for
replacement approvals and passes exact-source full verification: desktop739,
core240, and19 other native tests, with the existing2 core/16 desktop ignores.
The synthetic detector corpus is now constructed from readable deterministic
factories, checksum verified before npm verify/CI, and ignored by Git. No
detector consumer, test expectation, archived peer feature or vendor source
was changed for fixture packaging. The final verification began without the
generated corpus and recreated the original bytes before compilation.
