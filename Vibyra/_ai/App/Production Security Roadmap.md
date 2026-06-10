# Production Security Roadmap

Last reviewed: 2026-06-09

Scope: production security across the Expo app, Electron/Node desktop bridge,
Laravel API, billing, release infrastructure, and operations.

## Release Position

Public launch remains blocked. The 2026-06-09 implementation pass completed the
safe code-side controls below, but production readiness still requires
end-to-end encrypted LAN/preview transport and external release evidence.
"Production-ready" means evidenced risk controls, not a claim that the system
is invulnerable.

## Implemented 2026-06-09

- Backend sessions now have idle/absolute expiry, rotation grace, current logout,
  revocation metadata, and `off|observe|enforce` rollout modes.
- Reviewer/admin authorization uses immutable database role assignments with
  migration modes and cross-account tests.
- IAP receipt claiming and entitlement updates are atomic and canonical; Stripe
  events are persisted, deduplicated, customer-bound, and ordered.
- Verified recovery-link code, AASA/assetlinks responses, Universal/App Link
  configuration, exact parsing, and `legacy|dual|verified` rollout are present.
- Public native WebViews no longer execute community inline HTML and require
  approved HTTPS demos with private-network and storage isolation.
- Preview proxy timeout, concurrency, request/response-size, streaming, scoped
  credential, and legacy-token retirement controls are implemented.
- Expo 56, React Native 0.85.3, React 19.2.3, fingerprint runtime versioning,
  remote EAS versioning, and production channel configuration are implemented.
- Repository automation now includes SHA-pinned workflows, CodeQL, dependency
  review, Dependabot, secret history scanning, SBOM generation, CODEOWNERS, and
  an executable production security gate.
- Desktop LAN V2 foundations exist in `lanV2Identity.mjs`,
  `lanV2Protocol.mjs`, and `lanV2Sessions.mjs`: persistent identity, canonical
  signed transcripts, X25519/HKDF/AES-GCM, replay windows, expiry, and tests.
- Device credentials now carry expiry, scopes, phone identity, rotation chains,
  revocation reasons/generations, and protocol floors.

## Still Blocking Launch

- Wire backend-signed pairing assertions, native hardware-backed phone identity,
  `/v2/session`, and `/v2/rpc` into the real mobile/desktop request path.
- Protect preview HTML/assets over the encrypted native channel or proven pinned
  HTTPS, then disable Android cleartext traffic and the production HTTP desktop
  URL. The production audit intentionally fails these two checks.
- Deploy real recovery-link domain credentials and verify signed fresh installs.
- Complete provider-side secret revocation, GitHub branch/environment policy,
  release signing, backup/rollback and monitoring drills, physical-device
  testing, and independent penetration testing.
- Add App Attest/DeviceCheck and Play Integrity rollout if required by the final
  threat model; they are defense-in-depth rather than a substitute for auth.

## P0 Launch Blockers

1. Revoke or disprove the open Google API-key secret-scanning alert, rotate the
   key if active, scan full Git history, and enable push protection.
2. Encrypt and authenticate phone-to-desktop RPC. Add stable device identities,
   backend-signed pairing assertions, anti-replay sequence handling, session
   expiry, protocol-floor pinning, and no silent V2-to-V1 downgrade.
3. Protect preview HTML/assets separately from RPC. Use a native loopback
   gateway over the secure channel or proven pinned per-install HTTPS. Add proxy
   timeout, concurrency, decompression, and response-size limits.
4. Completed in code: backend session lifecycle and logout.
5. Completed in code: immutable reviewer/admin role assignments and focused
   cross-account review tests.
6. Completed in code: canonical atomic IAP and ordered idempotent Stripe events.
7. Completed in code; deployment pending: verified Universal/App Link recovery.
8. Completed in code; hosted-origin CSP deployment pending: public native
   WebViews require approved HTTPS and never execute community inline HTML.
9. Protect `main` and production deployments, sign every release artifact, and
   prove backup restore and migration rollback.
10. Complete signed physical-device testing and an independent mobile/API/LAN
    penetration test with zero open Critical or High findings.

## Ordered Delivery

### Phase 0: Containment And Governance

- Resolve the secret incident before feature work.
- Enable PR-only `main`, required security checks, restricted bypass, protected
  production environments, and manual production approval.
- Separate development, security-preview, staging, and production credentials,
  data, billing, and deployment targets.
- Write the threat model, asset inventory, data-flow diagrams, security owner
  matrix, incident contacts, severity policy, RPO, and RTO.

### Phase 1: Identity And Protocol Foundations

- Choose hardware-backed P-256 device identities or document why extractable
  Ed25519 keys are acceptable; do not mix designs without a crypto review.
- Define canonical pairing transcripts and encrypted RPC envelopes with shared
  cross-runtime test vectors.
- Add desktop and phone identity storage, backend pairing assertions with
  nonce/JTI replay storage, and device principals with scopes.
- Add flags: desktop `VIBYRA_LAN_V2_ENABLED/REQUIRED`; mobile
  `EXPO_PUBLIC_LAN_V2_MODE=off|prefer|required`.

### Phase 2: LAN V2 And Device Lifecycle

- Add dual-stack `/v2/session` and encrypted `/v2/rpc` using ephemeral agreement,
  directional keys, authenticated encryption, counters, replay windows, idle
  expiry, and absolute expiry.
- Persist `minimumProtocol=2` after successful V2 and reject downgrade.
- Add phone listing, expiry, rotation, replacement chain, Remove Phone, and
  revocation-generation handling. Keep Disconnect session-only.
- Measure legacy usage before disabling `VIBYRA_LEGACY_PHONE_TOKEN_ENABLED`.

### Phase 3: Preview And WebView Isolation

- Transport local preview requests through the encrypted native channel or
  pinned HTTPS; keep capabilities project-scoped inside that transport.
- Remove anonymous root-asset fallback and retire legacy preview credentials
  behind a separate `VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED` migration.
- Move public demos to an isolated HTTPS origin; disable cookies, storage,
  popups, file access, mixed content, unnecessary bridges, and private-network
  subrequests.
- Remove production Android cleartext permission only after LAN and preview V2
  are usable on supported devices.

### Phase 4: API, Authorization, And Billing

- Introduce focused session authentication/rotation services and additive
  lifecycle migrations, initially in observe mode.
- Add immutable privileged-role assignments, policies, append-only redacted
  security audit events, request correlation IDs, and named route rate limits.
- Add route-matrix tests for sessions, devices, projects, memory, feedback,
  community review, billing, and other user-owned records.
- Process verified purchase identity, receipt claim, ledger, and entitlement in
  one transaction. Persist Stripe event IDs and enforce event ordering.
- Add a deployment command that fails on debug mode, HTTP API URLs, wildcard
  CORS, missing secrets, legacy routes, or email-role fallback.

### Phase 5: Native And Release Platform

- Upgrade Expo 54 to Expo 56 in an isolated branch, align React Native/React and
  Node requirements, and clear the current build-chain advisories.
- Add fingerprint runtime versions, separate EAS channels/environments, remote
  versioning, commit-required builds, and production AAB/IPA profiles.
- Ship verified recovery links and association files using final Apple Team ID
  and Play signing fingerprints.
- Add App Attest/DeviceCheck and Play Integrity as report-only signals, then
  step-up controls for pairing, key rotation, and destructive account actions.
- Reassess export-compliance declarations after custom cryptography is final.

### Phase 6: Assurance And Operations

- Add CodeQL or equivalent SAST for TypeScript/Node/PHP, dependency review,
  history secret scanning, SBOMs, provenance/attestations, and SHA-pinned
  GitHub Actions with minimal permissions and timeouts.
- Centralize alerts for authentication attacks, privilege changes, pairing
  failures, replay/downgrade rejection, billing abuse, revocation latency, and
  security-flag changes without logging secrets or user content.
- Prove encrypted backups, isolated restore, database rollback, and incident
  response through recorded drills.
- Run abuse/load testing and a signed TestFlight/Play internal/desktop matrix,
  including rooted and jailbroken devices.

## Rollout Rules

- Use additive migrations and feature flags; rollback through policy flags, not
  destructive schema reversal.
- Roll LAN RPC, preview transport, session enforcement, roles, billing V2, and
  integrity enforcement independently.
- Progress `off -> prefer/report -> required` only after telemetry and
  compatibility gates pass.
- Never re-enable silent protocol downgrade, unrestricted inline public HTML, or
  arbitrary preview proxying as a normal rollback.

## Final Evidence Gate

- Packet capture reveals no credentials, RPC payloads, preview capabilities,
  HTML, cookies, or form bodies.
- Replay, tamper, reorder, stale-session, forged-response, downgrade, IDOR,
  privilege escalation, recovery takeover, SSRF, resource exhaustion, and
  purchase replay tests fail closed.
- Production configuration audit, full suites, SAST, dependency audits, secret
  scans, SBOM/provenance verification, signed artifacts, restore drill, and
  rollback rehearsal pass.
- Universal Links/App Links work on fresh physical installs; public WebViews
  cannot reach private networks; production Android allows no cleartext.
- Independent MASVS-based mobile/API/LAN pentest and retest leave no open
  Critical or High findings. Medium exceptions need an owner and expiry date.
