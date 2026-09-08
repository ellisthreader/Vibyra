# One mobile application

The maintained iOS app is `mobile/`, with “Build from your pocket.” as its
welcome page. It was preserved from the user-confirmed working
`/home/ellis/Desktop/Vibyra-iOS` checkout at `6f19d10`, including its uncommitted
mobile UI, onboarding, account, state and transport work. Host authentication
and protocol changes needed by that app were included. Its Host lockfile was
resolved against the existing main-branch desktop core, which remains unchanged.

The former root Expo application, root Expo/EAS/TypeScript configurations,
legacy tests/artwork, old iPhone screenshots, old browser profiles and mobile
preview captures are removed. The earlier committed companion welcome screen
is not included. The root npm scripts route exclusively to mobile. CI,
Dependabot, release-config inspection and agent memory use the mobile path.
The backend, desktop application and shared APIs are retained.

Validation includes mobile types, 37 tests and the 200-line gate; iOS/web
exports; 26 Host tests; real Host UI and bundled terminal checks; light/dark
compact/large browser journeys; Expo dependency alignment; the high-severity
npm audit gate; actionlint and repository security-policy tests. The existing
10 moderate Expo tooling advisories remain; no incompatible SDK downgrade was
applied. Native store release configuration still has its own unmet gates.

`node --test scripts/mobile-entrypoints.test.mjs` rejects restoration of a root
Expo app or the retired companion welcome screen. The removed source is not
used as a fallback, and no launcher should select an obsolete local checkout.
This is a normal repository change; Git commit history is not rewritten.
