# Welcome product captures

Production UI with sample content; no real account, network, provider or device operations.

- Desktop images: `desktop-tauri/tests/welcomeCaptureFixture.tsx`, actual Code terminal panes, Agents and Settings → Phone.
- Phone films and stills: `mobile/tests/welcomePhoneFixture.tsx`, actual ConnectFlow / DiscoveryStep / ConnectionProgress / ComputersScreen. React Native Web renders the production mobile components; these are not native-device screen recordings.
- Refresh everything: `node scripts/capture-welcome-product.mjs` from `mobile/`.
- Refresh phone only: `node scripts/capture-welcome-phone.mjs` from `mobile/` (uses Playwright’s ffmpeg, or FFMPEG_PATH).

Phone assets are 780×1560: maximum-quality DPR2 JPEG frames encoded once into 25fps WebM. A capture-only modal override removes the top sheet gutter and duplicate corner rounding. Preserve the exact 1:2 screen ratio inside the bezel. Production mobile components are unchanged.

The demo opens terminal panes at a fixed scale. Phone playback follows the shared intro clock and ends on the real Remote page. Reduce Motion uses the connected still. Changing capture geometry requires reviewing the desktop overlay coordinates.
