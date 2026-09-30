Write a single self-contained SVG illustration and save it as `{{OUTPUT}}` in
the current directory. Output only the file — no explanation.

PURPOSE
It is the hero banner at the top of the "What's New" window in Vibyra, a macOS
desktop app for running AI coding agents in terminals. It sits above the
changelog for this release. It is a wide decorative band that sets a mood — not
a diagram, not a screenshot, not an illustration of a feature.

THIS RELEASE IS ABOUT
{{SUBJECT}}

Let that steer the mood and the composition only. Do not try to depict the
feature literally, and never put anything readable in the image.

HARD CONSTRAINTS
- viewBox="0 0 740 232", width/height omitted so it scales.
- Rendered with object-fit: cover at 740x232 CSS px. Compose for that.
- Dark UI. Must read against #101219.
- NO text, NO lettering, NO numbers, NO logos, NO letter "V". Decoration only.
- No external references: no <image>, no web fonts, no url() to anything remote.
- Under 12 KB.

STYLE — this must match the releases before it
- Dark, illustrated, calm and deliberate. Flat vector shapes with soft gradient
  fills and gentle depth. Not glossy 3D, not glassmorphism, not neon, not
  photographic.
- Palette: deep indigo/navy ground (#101219, #1d2130, #141722), accents in the
  product blue #5b7cfa and #7490ff, one restrained warm highlight (a muted
  amber around #d4b18a) used sparingly as a single point of interest.
- Recurring motif across releases: an abstract night-workshop — softly glowing
  terminal-like panels at low opacity, layered at slight angles, drifting light
  and small floating particles, a sense of several machines quietly working.
  Rounded corners on panel shapes. Keep this motif; vary the arrangement,
  lighting and emphasis so each release looks related but not identical.
- Composition: edge-to-edge, interest toward the centre, quieter at the sides.
  The top-right corner is covered by a floating close button and the bottom
  ~50px fades into the panel below, so put nothing important in either.
