---
title: HKE Landing Video First Frame Mismatch - 2026-07-15
date: 2026-07-15
project: HKE
tags:
  - hke
  - incident
  - frontend
  - video
  - prevention
---

# HKE Landing Video First Frame Mismatch - 2026-07-15

## What Happened

The `/` landing page showed a small standalone logo image before playback, then expanded into a much larger MP4 animation after the user clicked. The preview therefore did not look or behave like the paused video.

## Root Cause

- Idle and playing states used different maximum widths (`42rem` versus `78rem`).
- A separate PNG was used until the hidden MP4 happened to decode.
- The prompt was removed from layout during playback, allowing the video position to shift.
- A frame-specific shader mask altered the opening frame, so it was no longer the literal video frame.

## Misleading Checks

- Confirming only that `video.paused === true` did not prove the user was seeing the decoded video frame.
- Separate idle and playing screenshots did not expose the geometry jump until their bounding rectangles were compared.
- A visually similar PNG was not an acceptable substitute for the requested MP4 frame.

## Fix Applied

- Removed the standalone PNG preview.
- Explicitly load the MP4 and seek within its first 24fps frame to force decoding without playback.
- Draw the decoded MP4 frame to the chroma-key canvas while paused.
- Use the same `1248 × 702` desktop video rectangle before and after clicking.
- Preserve the prompt's layout space while it is visually hidden during playback.
- Start playback from the logo/video button itself.

## Regression Guard

The interaction verification must assert all of the following:

- Idle video is paused on frame zero and has `readyState >= 2`.
- Video and canvas decode/render at `3840 × 2160`.
- Idle and playing button rectangles match within one pixel.
- Clicking the logo advances `currentTime`.
- Horizontal overflow is zero at desktop and mobile public viewports.

## Verification

- `npx vite build` — passed.
- Electron interaction check — passed: idle `currentTime=0`, playing `currentTime=0.719882`.
- Idle and playing rectangles — both `[96, 71, 1248, 702]`.
- Desktop viewport — `1440 × 900`, overflow `0`.
- Mobile viewport — `390 × 844`, visually checked.

## Prevention Checklist

- [ ] Use the decoded video frame for a video preview; do not substitute a similar image.
- [ ] Keep video geometry identical across paused and playing states.
- [ ] Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.
- [ ] Compare element bounding rectangles before and after interaction.
- [ ] Capture both desktop and mobile states.

## Related

- [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]]
- `/home/ellis/Desktop/HKE/resources/js/Pages/HomeLanding.tsx`
