# Computer Connection

The phone's `ui/ConnectScreen.tsx` mounts setup → search → connect → code.
UI and state are in `mobile/src/connection/`; onboarding path cards stay neutral
with a cobalt selected outline. The computer/phone art is drawn from views in
`connection/ConnectDevices.tsx` — theme tokens, a cast shadow, a blinking caret
and a link that pulses phone-ward — not a raster asset; the generated PNGs are
retired. Never restore a rectangular artwork backdrop, a panel or a glow behind
it: the devices sit straight on the sheet. `ConnectionModal.tsx` owns this
flow's quiet sheet chrome and sits on `colors.background` so cards read as
layers; the shared Sheet stays unchanged. The first page keeps its large left
aligned heading with the second line in accent, unboxed device artwork, three
unboxed numbered steps and a separate bottom action area. Instructions remain
native text.
Browser wide mode uses an explicit modal height; percentage height plus flex:0
collapsed the frame. The plan skill covers transparent-art inspection and
small-screen action checks.

Searching is the headline path; the code is a fallback link for relay, remote
and non-advertising computers. `DiscoveryStep.tsx` starts the browse as the
search page appears, which is what makes iOS ask for Local Network access; the
page is only reached by an explicit action and nothing else scans. One resolved
computer hands itself off after ~1.3s, several are a choice, and an unresolved
one is announced but disabled. `RadarScan`/`RadarBlip`/`ConnectBeam` use RN
`Animated` only (no reanimated, no SVG or gradient library); `radarMotion.ts`
owns the loop/breath/appear drivers and Reduce Motion draws the same picture at
rest. Blip angles come from `radarAngles`, evenly spread with a hashed offset —
hashing per id stacked neighbours, because service names share a long suffix.
Height under 780 tightens both screens and drops the secondary trust note so
Cancel/Try again never needs scrolling.

`ComputerBrowser.swift` browses `_vibyra-host._tcp` with
`bonjourWithTXTRecord` and reads the Host identity from TXT `id`.
`ServiceResolver.swift` resolves each result with `NWConnection`: `.ready` gives
`currentPath.remoteEndpoint` as a concrete host/port and proves reachability,
and `currentPath.unsatisfiedReason == .localNetworkDenied` is Apple's
authoritative consent verdict alongside the `NWBrowser` DNS `-65570` error.
Loopback, link-local and multicast addresses are skipped; a WebSocket URL
cannot carry them. `app.config.ts` owns NSBonjourServices and
NSLocalNetworkUsageDescription. Search is bounded to 30 seconds, stops on
dismissal/navigation/background, and ignores late callbacks. The OS alert's
inactive state is not background. Denial is never inferred from no results.
Expo Go/web show code pairing, with no fake search or permission UI.

`nearbyPairing.ts` builds a pairing from a resolved computer and re-validates it
through `parsePairing`, so discovery cannot widen what the phone connects to.
`Identity::id()` **is** the Host static public key, so TXT `id` alone satisfies
Noise IK. The pairing carries `nearby: true`, accepted only with
`route: 'direct'` and `network: 'lan'`; `state/connection.ts` treats it like an
invite for status, so a new computer shows `pairing` (awaiting approval).

Host `--discover` now also enables code-free pairing (`Shared.nearby`, set from
the flag; the embedded desktop sets it when it advertises). An invite-less
`Hello` enters the same bounded queue, logs `Nearby pairing request from ...`,
and is trusted only after a local `approve KEY` or Approve in Desktop
Settings. Discovery off still requires a valid short-lived invitation, and any
supplied invitation is always verified. The advertisement adds the public key
and nothing else — still no invitations, device keys, credentials or project
data. Discovery is not authentication.

Validation: mobile check/export, `verify:discovery` (scripted adapter, all
screens, 3 widths × 2 themes), `verify:nearby` (real Host without `--pair`:
`dns-sd` advertisement, TXT `id` == public key, no invitation, local approval,
enrollment), `verify-connection-ui.mjs`, Host tests/Clippy, and iOS-target
`swiftc -typecheck` of the module's Network sources. Verified 2026-09-09.
Not yet verified: any run of the Swift module itself. CocoaPods is not
installed on this Mac, so no iOS development build was produced, and physical
iPhone consent, background and store readiness remain open.

Use the Expo diagnostics skill for build/runtime and permission checks.
`docs/mobile-computer-connection.md` holds launch instructions and image prompt.
