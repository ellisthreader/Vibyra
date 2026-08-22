---
title: RelayClarity Preview Text Caret Incident - 2026-07-10
date: 2026-07-10
tags:
  - relayclarity
  - vibyra
  - incident
  - preview
  - accessibility
  - prevention
status: fixed
project: "[[RelayClarity]]"
related: "[[01 Projects/Vibyra/Memory/Vibyra Desktop Memory|Vibyra Desktop Memory]]"
---

# RelayClarity Preview Text Caret Incident - 2026-07-10

## What happened

Clicking ordinary text in the RelayClarity homepage preview could display a vertical insertion caret inside headings or paragraphs. The text was not editable and the line looked like a broken UI element.

## Root cause

Vibyra's Electron/Chromium preview had caret browsing enabled for the active session. Chromium caret browsing lets a click place a text-navigation cursor inside normal, non-editable page content.

The RelayClarity source contained no `contenteditable`, `designMode`, or page-level click handler that made headings editable. Vibyra intercepts F8 for voice input but does not intercept F7, so an accidental F7 keypress can reach Chromium and toggle caret browsing.

## Fix applied

RelayClarity now sets `caret-color: transparent` on normal page content in `src/styles.css` and restores `caret-color: auto` for:

- `input`
- `textarea`
- enabled `[contenteditable]` elements

This hides the browser navigation caret without breaking genuine form-field cursors.

## Prevention checklist

- [ ] If a vertical cursor appears inside ordinary text, test caret browsing before changing layout or typography.
- [ ] Press F7 in the preview to turn caret browsing off.
- [ ] Search the affected app for `contenteditable`, `designMode`, and global pointer handlers before concluding that the page made text editable.
- [ ] Preserve visible carets for inputs, textareas, and genuine editable elements when adding a CSS safeguard.
- [ ] For a Vibyra-level permanent fix, handle F7 in the preview shell or explicitly disable Chromium caret browsing for preview web contents.

> [!bug] Diagnostic rule
> A thin insertion line between letters in otherwise normal text is usually a browser caret, not a rendered border or stray application content.

## Verification

- Confirmed no editable heading behavior in the RelayClarity source.
- Confirmed Vibyra's saved Chromium preferences did not contain a persistent caret-browsing setting, indicating a session-level toggle.
- Confirmed Vibyra handles F8 but has no F7 interception.
- RelayClarity production build passed after the CSS safeguard.

