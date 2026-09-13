import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ansi, type AnsiPalette } from '../src/terminal/ansi';
import { palettes } from '../src/theme';
import { terminalState } from '../src/terminal/terminalState';

// xterm's built-in palette is drawn for a black terminal, and assigning a theme
// replaces the whole object — so sending only background/foreground left all 16
// of these at defaults. On the light ground that put brightWhite at 1.12:1 and
// brightYellow at 1.20:1: plain text read, every coloured word disappeared. The
// browser harnesses all hardcode the dark theme, so nothing caught it; this runs
// in `npm test`, which does gate CI.
const channel = (value: number) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(at => channel(parseInt(hex.slice(at, at + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

// ANSI black is a background colour by definition and cannot also be readable
// as text; `minimumContrastRatio` in the terminal runtime lifts it in place.
const foregrounds = (palette: AnsiPalette) =>
  Object.entries(palette).filter(([name]) => name !== 'black');

test('every ANSI colour a tool paints with clears WCAG AA on its own ground', () => {
  for (const mode of ['dark', 'light'] as const) {
    const ground = palettes[mode].workspace;
    for (const [name, hex] of foregrounds(ansi[mode])) {
      const ratio = contrast(hex, ground);
      assert.ok(ratio >= 4.5, `${mode} ${name} ${hex} is ${ratio.toFixed(2)}:1 on ${ground}`);
    }
  }
});

test('the colours that actually disappeared are the ones now pinned', () => {
  // Each ground failed differently, so guard each with the colour that failed
  // on it. Dark: SGR 90, which every CLI uses for hints, timings and dimmed
  // detail — the Tango default #555753 sat at 2.58:1. Light: the bright end,
  // where #eeeeec came out at 1.12:1, i.e. white on white.
  assert.ok(contrast('#555753', palettes.dark.workspace) < 4.5, 'the dark default was the wrong choice');
  assert.ok(contrast(ansi.dark.brightBlack, palettes.dark.workspace) >= 4.5);
  assert.ok(contrast('#eeeeec', palettes.light.workspace) < 1.6, 'the light default was invisible');
  assert.ok(contrast(ansi.light.brightWhite, palettes.light.workspace) >= 4.5);
});

test('the theme sent to the terminal carries all sixteen colours, not four', () => {
  for (const [mode, dark] of [['dark', true], ['light', false]] as const) {
    const { theme } = terminalState('output', true, palettes[mode], dark);
    assert.equal(theme.background, palettes[mode].workspace);
    assert.equal(theme.foreground, palettes[mode].text);
    for (const [name, hex] of Object.entries(ansi[mode])) {
      assert.equal(theme[name as keyof AnsiPalette], hex, `${mode} ${name} reached the terminal`);
    }
  }
});

test('the two palettes stay distinct, so a theme swap actually changes the output', () => {
  for (const name of Object.keys(ansi.dark) as (keyof AnsiPalette)[]) {
    assert.notEqual(ansi.dark[name], ansi.light[name], `${name} is the same in both themes`);
  }
});
