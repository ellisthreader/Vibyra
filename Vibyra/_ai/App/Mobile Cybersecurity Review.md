# Mobile Cybersecurity Review

Last reviewed: 2026-06-09

Scope: the Expo phone app, Laravel account API, and Node/Electron desktop bridge
because the phone can authorize actions against both remote systems.

## Release Position

Do not ship publicly until the remaining open P0 findings below are fixed and
retested. Cloud route exposure, new preview credentials, production API-origin
confinement, mobile secret storage, and per-device credential groundwork were
addressed on 2026-06-09. Cleartext LAN control traffic remains the principal
release blocker.

## P0 Release Blockers

1. Fixed 2026-06-09: legacy Laravel desktop-control routes are disabled by
   default outside local/testing environments. Temporary rollout override:
   `VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED`.
2. Fixed for new flows 2026-06-09: phone preview and apply URLs use random,
   project-scoped, expiring capabilities. The legacy global-token compatibility
   path remains enabled for migration and must be removed after adoption.
3. Partially fixed 2026-06-09: new pairings receive cryptographically random
   per-device credentials whose secret is SHA-256 hashed at rest and bound to
   the account. Credentials now carry expiry, scopes, phone identity, rotation
   chains, revocation metadata/generations, and minimum protocol floors.
   Existing global tokens remain behind `VIBYRA_LEGACY_PHONE_TOKEN_ENABLED`;
   user-facing device removal and retirement of the global token remain open.
   `/desktop/disconnect` intentionally ends only the current session so normal
   remembered reconnect behavior is not broken.
4. Open: protect phone-to-desktop traffic. LAN URLs and bearer requests still use
   cleartext HTTP. Pairing must establish an authenticated encrypted channel,
   such as pinned per-install TLS or an application-layer session with
   encryption, integrity, replay protection, and per-device keys.
5. Mobile fixed 2026-06-09: backend and remembered-desktop credentials migrate
   from `vibyra.session.v1` into Expo SecureStore backed by Keychain/Keystore;
   web keeps a separate localStorage secret item. Electron still needs
   main-process OS-protected credential storage.
6. Fixed 2026-06-09: production backend requests now use exactly one configured
   or default HTTPS origin. Runtime origin memory, normal retries, and streaming
   retries share `src/utils/appApiOrigins.ts`; redirects fail closed, while
   development retains LAN, Expo-host, browser-host, and localhost discovery.
7. Partially fixed 2026-06-09: the mobile app now uses Expo SDK 56.0.9, React
   Native 0.85.3, React 19.2.3, and TypeScript 6.0.3 with Node 20.19.4 as the
   minimum. Expo dependency alignment, Expo Doctor 21/21, TypeScript, and 109
   mobile tests pass. Root npm still reports twelve moderate Expo
   config-plugin/xcode-chain advisories and zero high or critical findings.
   npm's forced remediation would incorrectly downgrade Expo to 46, so track
   upstream fixes instead of applying it.

## Encrypted LAN Rollout

1. Add protocol V2 behind `VIBYRA_LAN_V2_ENABLED` on desktop and
   `EXPO_PUBLIC_LAN_V2_MODE=off|prefer|required` on mobile.
2. Use persistent Ed25519 phone and desktop identities, ephemeral X25519 key
   agreement, HKDF-SHA-256 directional keys, and AES-256-GCM envelopes.
3. Sign a canonical pairing transcript and show a short authentication code on
   both devices before confirming the credential.
4. Establish short-lived sessions through `/v2/session`; carry control calls in
   encrypted `/v2/rpc` envelopes with independent sequence counters and a replay
   window.
5. Allow V1 during measured migration, but once a credential completes V2,
   record protocol 2 as its minimum and never silently downgrade it.
6. Require cross-runtime crypto vectors, tamper/replay tests, old/new client
   compatibility, desktop restart, IP change, two-device revocation, and
   physical iOS/Android tests before switching from `prefer` to `required`.
7. Treat preview WebView transport as a separate gate: RPC encryption does not
   encrypt preview HTML/assets. Use pinned HTTPS or an approved native transport
   before claiming complete LAN encryption.

Desktop foundations now exist in `desktop/lib/lanV2Identity.mjs`,
`lanV2Protocol.mjs`, and `lanV2Sessions.mjs`, including persistent identity,
canonical signed transcripts, X25519/HKDF/AES-GCM, replay windows, session
expiry, and deterministic tests. These modules are not yet connected to the
real pairing/request routes. Native phone key custody, backend assertions, V2
route integration, and secure preview transport remain the release blocker.

## P1 Before Public Release

- Implemented 2026-06-09: backend sessions have 14-day idle and 90-day absolute
  expiry, explicit current logout, rotation with a 120-second previous-token
  grace, revocation metadata, and `off|observe|enforce` rollout modes.
- Fixed in code 2026-06-09: Explore never executes community `previewHtml`.
  Public demos require an approved HTTPS host, use exact-origin top-level
  navigation, have no React Native message bridge or persistent DOM/cache
  storage, reject file/mixed/new-window access, and guard common JavaScript
  network APIs from local/private targets. Inline-only posts show unavailable.
  Local user-initiated developer previews retain inline/LAN support in the
  normal `AppWebView` path. Physical iOS/Android validation and restrictive CSP
  on the hosted demo origin remain release requirements.
- Implemented 2026-06-09: password recovery accepts only the configured exact
  HTTPS `/reset-password` URL or the exact legacy custom scheme. Expo registers
  the iOS associated domain and Android `autoVerify` path; Laravel serves the
  AASA/assetlinks documents, applies no-referrer fallback responses, and supports
  `RECOVERY_LINK_MODE=legacy|dual|verified`. Deployment still requires the real
  Apple Team ID, Play App Signing SHA-256 fingerprint, owned-domain DNS/HTTPS,
  signed native binaries, and physical-link verification before disabling legacy.
- Require a short-lived backend-signed pairing assertion bound to the account,
  phone install key, and desktop nonce. Rate-limit pairing and status polling.
- Partially fixed 2026-06-09: pairing bodies and fields are bounded, pending and
  approved requests expire after two minutes, pair/status routes are rate
  limited, pair codes use cryptographic randomness, and duplicate polling
  remains idempotent.
- Fixed 2026-06-09: phone pairing and fallback URLs accept private/loopback HTTP
  or exact configured HTTPS relay origins only. Public HTTP, userinfo, paths,
  custom schemes, encoded IPs, and lookalikes are rejected.
- Implemented 2026-06-09: immutable reviewer/admin role assignments are keyed by
  user ID with grant/revoke metadata and `legacy|bootstrap|database` migration
  modes. Email changes, deletion, and reuse cannot transfer privilege. Focused
  cross-account review tests pass; the broader all-resource matrix can expand.
- Fixed 2026-06-09: scoped and legacy preview proxy credentials can reach only
  exact tracked app/Vite origins. Redirects remain manual. Metadata, public,
  encoded-IP, IPv6 loopback, and untracked targets are rejected. Emergency
  rollback is `VIBYRA_LEGACY_PREVIEW_ARBITRARY_PROXY_ENABLED=true`.
- Implemented 2026-06-09: preview proxy requests have configurable timeout,
  concurrency, request/response-size limits, preserved range streaming, no
  anonymous active-capability fallback, and an independent
  `VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED` retirement flag.

## Rollback And Validation

- Integrated regression baseline on 2026-06-09: TypeScript, 109 mobile tests,
  Expo dependency alignment and Doctor, web/iOS/Android exports, 649 desktop
  tests with `--test-concurrency=1`, and 268 backend tests pass. The backend has
  one intentionally skipped bridge integration test. The production audit
  passes 36 checks and fails only the two documented cleartext-transport gates.
- Pair-rate rollback: `VIBYRA_PAIR_RATE_LIMIT_ENABLED=false`.
- Mobile URL-policy rollback: `EXPO_PUBLIC_STRICT_DESKTOP_URLS=false`.
- Legacy arbitrary preview proxy rollback:
  `VIBYRA_LEGACY_PREVIEW_ARBITRARY_PROXY_ENABLED=true`.
- Production CORS: configure `VIBYRA_CORS_ALLOWED_ORIGINS`; wildcard behavior is
  local/testing only unless `VIBYRA_CORS_ALLOW_ANY_ORIGIN` is explicitly set.
- `.github/workflows/security.yml` runs high-severity npm audits, Composer audit,
  Expo dependency checks, TypeScript, mobile tests, desktop pairing/preview
  tests, the backend build, the full Laravel suite, a pinned Gitleaks history
  scan, and CycloneDX SBOM generation. Separate pinned workflows run CodeQL,
  dependency review, and the manual production security gate.
- `scripts/security/audit-production-config.mjs` validates SHA-pinned actions,
  minimal workflow permissions, job timeouts, release configuration, and named
  production environment controls without printing secret values. Its JSON
  output is retained as release evidence; current app/EAS configuration passes
  36 checks and intentionally fails only Android cleartext and the production
  HTTP desktop URL until encrypted transport is activated.
- `docs/security/production-release-gates.md` is the external evidence
  checklist. Repository automation does not complete branch protection,
  provider-side key revocation, signing, backup restoration, monitoring drills,
  physical-device validation, or independent penetration testing.

## Remaining Staged Work

1. Implement LAN V2 authenticated encryption and downgrade protection behind
   `off`, `prefer`, and `required` rollout modes; this requires new native
   binaries and physical-device tests.
2. Add user-facing device listing, rotation, and destructive **Remove phone**
   using the implemented credential lifecycle; keep **Disconnect** session-only.
3. Transport preview HTML/assets securely; proxy resource limits are complete.
4. Completed 2026-06-09: backend session lifecycle.
5. Completed 2026-06-09: immutable reviewer/admin roles.
6. Deploy the recovery-link association credentials and owned HTTPS domain,
   verify fresh-install Universal/App Links on signed binaries, then move
   `RECOVERY_LINK_MODE` from `dual` to `verified`.
7. Completed 2026-06-09: Expo SDK 56 dependency and config migration. New
   production-signed development/TestFlight/internal-track binaries and
   physical-device regression testing remain required because React Native,
   native Expo modules, and the minimum iOS target changed.

## Existing Safeguards

- Backend opaque session tokens are stored hashed server-side.
- Apple and Google identity tokens are verified server-side; Apple uses a nonce.
- Password reset and account deletion revoke sessions.
- Purchase verification now requires canonical store transaction/product IDs.
  Receipt claims, ledgers, and entitlements are atomic and unique; cross-account
  replay is rejected. Stripe event IDs, customer binding, retry state, and
  ordering are persisted and tested.
- Desktop UI control routes have loopback checks in the Node desktop runtime.
- QR pairing does not embed the desktop bearer.
- App lock is enforced at launch and foreground resume.
- Cloud sync strips the desktop token.
- Mobile persistence serializes protected writes, verifies legacy migration
  before sanitizing public state, and queues explicit sign-out, cache-clear, and
  session-expiry secret deletion ahead of React state persistence effects.
  Login and desktop-token deletion semantics remain distinct. Start at `src/utils/persistence.ts`,
  `src/utils/persistenceSecrets.ts`, and `src/utils/secretStorage.ts`.
- A cryptographically random scoped preview-capability implementation already
  exists and should become the only preview authorization mechanism.

## Required Verification

Use OWASP MASVS as the acceptance baseline. Automate dependency, secret, static
analysis, authorization, and production-origin tests in CI. After remediation,
commission an independent mobile/API/LAN penetration test covering MITM and
replay, rooted-device extraction, malicious generated WebView content, preview
SSRF, pairing flood/replay, cross-account access, and purchase replay.
