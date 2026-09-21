import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentIds, accents, isAccentId, paletteFor, palettes } from '../src/theme';

// Settings lets a person repaint every button and link, so each accent has to hold
// the same line Cobalt was approved at, in both themes. Graphite's dark button is
// near-white, which only reads because its label is `onAction` and never a literal
// white — that is the pairing this file keeps honest.
const channel = (value: number) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(at => channel(parseInt(hex.slice(at, at + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}
const modes = [['dark', true], ['light', false]] as const;

test('every accent keeps its button label and its own text at WCAG AA in both themes', () => {
  for (const id of accentIds) for (const [mode, dark] of modes) {
    const colors = paletteFor(dark, id);
    const where = `${id} ${mode}`;
    assert.ok(contrast(colors.onAction, colors.action) >= 4.5, `${where}: button label ${contrast(colors.onAction, colors.action).toFixed(2)}:1`);
    for (const ground of ['background', 'surface'] as const) {
      assert.ok(contrast(colors.accent, colors[ground]) >= 4.5, `${where}: accent on ${ground} ${contrast(colors.accent, colors[ground]).toFixed(2)}:1`);
    }
  }
});

test('an accent moves only the interaction colours, never status or neutrals', () => {
  const moving = new Set(['accent', 'accentSoft', 'action', 'onAction']);
  for (const id of accentIds) for (const [mode, dark] of modes) {
    const colors = paletteFor(dark, id);
    for (const [role, value] of Object.entries(palettes[mode])) {
      if (!moving.has(role)) assert.equal(colors[role as keyof typeof colors], value, `${id} ${mode} changed ${role}`);
    }
  }
});

test('Cobalt is the approved palette itself, and anything unknown falls back to it', () => {
  assert.deepEqual(accents.cobalt.dark, { accent: palettes.dark.accent, accentSoft: palettes.dark.accentSoft,
    action: palettes.dark.action, onAction: palettes.dark.onAction });
  assert.equal(paletteFor(true), palettes.dark);
  assert.equal(paletteFor(false, 'cobalt'), palettes.light);
  assert.equal(paletteFor(true, 'toString' as never), palettes.dark);
  assert.equal(isAccentId('toString'), false);
  assert.equal(isAccentId('teal'), true);
  // One object per theme and accent, or effects keyed on `colors` run on every render.
  assert.equal(paletteFor(true, 'teal'), paletteFor(true, 'teal'));
});
