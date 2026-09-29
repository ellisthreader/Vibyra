# Remote security backend release candidate

Base: `06012861b19acc75d27285d026420f187256f1d5` (`origin/railway-production`).
Branch: `codex/remote-security-release-20260929`.
Source inventory and SHA-256 hashes: `remote-security-source.json`.
No production push or Railway deployment was performed by this preparation.

## Validation

- Untouched production baseline: 169 files, 163 passed.
- Security-only candidate: 184 files, 179 passed.
- Storage-inclusive candidate: 185 files, 180 passed.
- Final focused remote/auth/CSP/storage/download suites: 25/25 files passed.
- Production website Vite build passed. Real Chromium verified marketing,
  analytics choice, login portal, legal styling and passkey script under CSP;
  injected inline/external scripts and event handlers were blocked.
- Composer target PHP is 8.3.15, matching production Nixpacks PHP83. Newly added
  `symfony/filesystem` is 7.4.18 (PHP>=8.2); existing locked packages are unchanged.

Raw per-file summaries/failures and browser output are retained in
`/private/tmp/vibyra-remote-security-release-evidence-20260929/`.
The final five failures are identical to the untouched baseline, including
assertion/failure counts: AuthThrottleSeparation, ProductionProcessTopology,
VibesAutoGuardrails, VibesEntitlements, VibyraProjectPreviewSecurityApi.
Baseline RemoteAccess failures are resolved by the new strong-authorization fixtures.
A first candidate pass overlapped Vite's output rebuild and briefly missed its
manifest; the isolated retest and subsequent full run passed LocalOwnerAccess.

## Production-specific preservation

- Preserve production remote-route market policy, Microsoft email verification
  redirects and exact cloud state-sync byte normalization.
- Preserve website source/design, release metadata, notarized flag and consented
  download analytics. Trusted production Turnstile and legal styles receive
  explicit nonce attributes; the mobile web client needs a separate policy.
- Preserve production account-deletion verification and cascade behavior. Add
  host-locked durable remote disconnect before cascade to both app/provider
  deletion paths; do not import unrelated root account-cleanup changes.
- Keep release storage local by default. Object migration is explicit, private,
  read-back SHA-256 verified and leaves originals untouched. The configured
  fallback applies to missing objects, never a corrupt/broken primary.
- Do not deploy proof enforcement without compatible Host/native/web clients,
  stable signing secrets, exact passkey RP/origin, migrations and queue/scheduler.

## Mobile web artifact and actual server acceptance

The coordinated Expo export is mounted at `/app`, with its exact file/hash list
in `remote-web-source.json`. Its build-owned assets stay outside `public/` and
are served only by manifest entries. This avoids PHP's static-directory handling
intercepting `/app` before Laravel can supply its policy. The entry and
`/app/index.html` have the explicit mobile CSP/no-store; the Noise iframe keeps
its compiled hash policy and same-origin framing. Unknown and traversal paths
return404. Assets have safe MIME types and conditional ETag responses.

- Final backend with mobile web: **186 files, 181 passed**, same five baseline
  failures and counts; `web-candidate-final.txt`/`.failures.txt` retain results.
- Web-specific API boundary: **2 tests, 45 assertions**, `remote-web-api.txt`.
- Actual Laravel HTTP server + Chromium: exported welcome loads with no JS/CSP
  violations; the real Noise iframe initializes WASM and posts its source/origin
  verified `ready` event. All external network requests were blocked during this
  check (`laravel-app-browser.txt`). This does not claim a live account connection.
