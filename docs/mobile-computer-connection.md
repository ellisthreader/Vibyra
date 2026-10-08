# iPhone computer connection

The connection sheet has four small surfaces: installation steps, the live
nearby search, the connection screen for a chosen computer, and the QR/link
pairing form kept as a fallback. Searching is the headline path; a code is only
needed for relay, remote or non-advertising computers.

Opening the sheet, confirming installation or mounting the app never scans.
`DiscoveryStep.tsx` starts the browse as the search page appears, which is what
makes iOS present its Local Network alert; reaching that page is always an
explicit action.

## Native discovery

`mobile/modules/vibyra-discovery/` is an autolinked local Expo module.
`ComputerBrowser.swift` uses Apple Network.framework's `NWBrowser` with
`bonjourWithTXTRecord` for `_vibyra-host._tcp` in `local.`, reads the Host
identity from the TXT `id` entry, and hands each result to
`ServiceResolver.swift`. That resolver uses `NWConnection` so Apple performs
the resolution: reaching `.ready` yields a concrete `host:port` from
`currentPath.remoteEndpoint` and proves the Host is reachable, and
`currentPath.unsatisfiedReason == .localNetworkDenied` is Apple's authoritative
verdict when consent was refused. Loopback, link-local and multicast addresses
are skipped because a WebSocket URL cannot carry them.

No subnet scanning, synthetic permission probe, or multicast entitlement is
used. The Info.plist usage description and Bonjour declaration live in
app.config.ts. Denied access offers Settings and an explicit retry, and denial
is never inferred from an empty result set. Each search lasts at most 30 seconds
and stops on backgrounding, leaving the search page, or dismissal. The
permission alert's inactive app state must not cancel the browse.

## Connecting without a code

`nearbyPairing.ts` turns a resolved computer into a pairing and runs it through
the same `parsePairing` validation a scanned code gets, so discovery cannot
widen what the phone will connect to. The Host static public key is its
`hostId`, so the TXT record supplies everything Noise IK needs; the pairing is
marked `nearby`, which is only accepted for `route: 'direct'` with
`network: 'lan'`. There is no invitation, so the computer holds the handshake
while its owner approves, and `ConnectingStep.tsx` shows that as the step it is.

One resolved computer hands itself off automatically after a short beat; several
are offered as a choice; a computer that has not resolved yet is announced but
not tappable.

Expo Go and web offer pairing-code entry without pretending to search.
Install CocoaPods and configure Xcode for an iOS development build before
running `npm --prefix mobile run ios`. A physical iPhone is needed to qualify
the system Local Network alert; Simulator does not implement this privacy gate.

## Computer side

The standalone Host is separate from the Tauri desktop download. A downloadable
Host installer / desktop integration is still a release dependency; do not point
the setup steps at an unrelated desktop installer.

For a trusted local network, run the Host with discovery explicitly enabled:

```sh
./host/scripts/run.sh --project /absolute/project --listen 0.0.0.0:4318 \
  --public-url ws://192.168.1.10:4318 --discover --pair
```

`--pair` is optional now: with `--discover`, a phone that found the Host may
ask to pair without any code. Use the computer's actual LAN IP.

Bonjour advertises presence and the Host static public key, which is public by
construction and authorizes nothing on its own. It still carries no invitation,
device key, credential or project data. A code-free request enters the same
bounded approval queue, logs `Nearby pairing request from ...`, and becomes
trust only after an explicit local `approve KEY` (or Approve in Vibyra Desktop
Settings > phone connection). With discovery off, a valid short-lived
invitation stays mandatory, and any invitation that is supplied is always
verified. Discovery is not authentication; Noise pinning and trusted-device
checks are retained.

## Validation

- `npm --prefix mobile run check` and `npm --prefix mobile run export`.
- `npm --prefix mobile run verify:discovery` renders the real search, choice,
  blocked and connection screens against a scripted adapter, in compact, iPhone
  and wide layouts in both themes. It asserts the auto handoff, that several
  computers never auto-connect, and that an unresolved computer stays disabled.
- `npm --prefix mobile run verify:nearby` runs the whole code-free path against
  a real Host started without `--pair`: it reads the advertisement with Apple's
  `dns-sd`, checks the TXT `id` equals the Host public key, connects with no
  invitation, requires the local approval, then confirms enrollment.
- `node mobile/scripts/verify-connection-ui.mjs` against Metro; set CHROME_PATH
  to installed Chrome. Checks compact, iPhone and wide layouts in both themes,
  and that a client without the native module never pretends to search.
- iOS-target Swift typecheck of the module's Network.framework sources:
  `xcrun swiftc -typecheck -sdk "$(xcrun --show-sdk-path --sdk iphoneos)" \
    -target arm64-apple-ios16.0 mobile/modules/vibyra-discovery/ios/*.swift`
  (omit `VibyraDiscoveryModule.swift`, which needs ExpoModulesCore).
- `cargo test --manifest-path host/Cargo.toml -p vibyra-host`.
- Native acceptance: allow, deny, Settings retry, empty Wi-Fi, found/lost Host,
  background, close/reopen and pairing approval on a physical iPhone.

## Artwork

Saved asset: `mobile/assets/connect-computer-transparent.png`. Generated with the built-in
image generation tool. Keep the steps as accessible native text, outside the art.
The artwork has real alpha and uses contain with an explicit image height.

## Sheet layout and motion

`ConnectionModal.tsx` replaces the generic toolbar with quiet sheet chrome.
A large left-aligned title, unboxed devices, connected step markers and a
separate bottom action area define the first page. The search and connection
pages are centred instead, around the radar and the phone-to-computer beam.
Motion uses RN `Animated` only, with no reanimated, SVG or gradient library:
`radarMotion.ts` owns the loop, breath and appear drivers, and Reduce Motion
draws the same picture at rest. Radar blip angles are spread evenly by
`radarAngles` from a hashed offset, because Bonjour names share a long suffix
and hashing each one alone stacked neighbours together. A window height under
780 tightens both pages and drops the secondary trust note, so Cancel and Try
again never need scrolling. Check the compact primary action and wide modal
geometry.

Final generation prompt:

```text
Use case: stylized-concept
Asset type: transparent PNG cutout used directly on an iPhone setup sheet in both light and dark modes.
Create an elegant, minimal, premium 3D product illustration of ONE open slim silver aluminum laptop and ONE upright graphite smartphone slightly in front of its right side. A calm, confident industrial design, soft rounded corners, matte materials, beautiful precise bevels. Three-quarter front view from slightly above. Laptop screen is an uninterrupted muted cobalt blue surface with a single small white outlined terminal prompt glyph, phone screen is the same cobalt with one small white checkmark. No other interface details.
Composition: landscape 3:2, compact centered group, laptop facing slightly right, all devices completely visible, fill 82% of the width with generous clear space above and below. Phone approximately two thirds the height of the open laptop.
Lighting: soft neutral studio illumination, subtle light edges on metal readable on near-black AND off-white backgrounds. Restrained, sophisticated, no dramatic glow.
CRITICAL: genuinely TRANSPARENT background with an alpha channel. Isolated objects only. No background color, no rectangular panel, no gradient backdrop, no floor, no ground plane, no cast shadow outside the objects, no fog, no halo, no surrounding decoration, no lines connecting devices, no checkerboard painted into pixels.
No words, no letters, no logos, no watermark. This is a production transparent asset, not a mockup of a modal or a screenshot.
```

References: [Apple local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
and [Expo local modules](https://docs.expo.dev/modules/get-started/).
