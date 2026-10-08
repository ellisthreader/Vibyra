// Ported verbatim from the iPhone's mobile/src/cloud/liftMotion.ts (keep the two in step): the timing and geometry
// behind the Connect to cloud scene, pure so it is tested without a renderer.
/** The scene's fixed height; widths come from layout. */
export const SCENE_HEIGHT = 372;
/** How many project cards fly; the rest are counted on the last card ("+4 more"). */
export const MAX_CARDS = 5;

export const SCRAMBLE_MS = 460;
export const RISE_MS = 1250;
export const STAGGER_MS = 380;
/** The travellers a scene shows: up to MAX_CARDS names, the last one standing in for the rest. */
export function travellers(projects: string[], accounts: string[]): { kind: 'project' | 'account'; label: string }[] {
  const unique = projects.map(name => name.trim() || "Project");
  const shown = unique.length > MAX_CARDS
    ? [...unique.slice(0, MAX_CARDS - 1), `+${unique.length - MAX_CARDS + 1} more`]
    : unique;
  return [...shown.map(label => ({ kind: "project" as const, label })), ...accounts.map(label => ({ kind: "account" as const, label }))];
}

/** Where the scene's parts sit, for a scene `width` wide. */
export function sceneLayout(width: number) {
  return { cloud: { x: width / 2, y: 88 }, mac: { x: width / 2, top: 276 } };
}

export const PILL_HEIGHT = 38;
const PILL_GAP = 8;

/** A card sized to its name (13 pt semibold runs up to about 7.5 pt a character) beside its icon tile, within what a row
 *  can hold. */
const pillWidth = (label: string, width: number) => Math.round(Math.min(Math.max(84, label.length * 7.5 + 56), Math.max(96, width / 2 - 12)));

/** Where each traveller rests before it lifts, and a pill's width: projects packed into centred rows above the
 *  computer (two rows at most, the scene's room), AI accounts as badges beside it (left, right, then further out). */
export function slots(items: { kind: 'project' | 'account'; label: string }[], width: number) {
  let widths = items.map(item => item.kind === 'project' ? pillWidth(item.label, width) : 0);
  const used = (row: number[]) => row.reduce((sum, i) => sum + widths[i], 0) + Math.max(0, row.length - 1) * PILL_GAP;
  const pack = () => {
    const rows: number[][] = [[]];
    items.forEach((item, i) => {
      if (item.kind !== 'project') return;
      const row = rows[rows.length - 1];
      if (row.length && used(row) + PILL_GAP + widths[i] > width - 8) rows.push([i]); else row.push(i);
    });
    return rows;
  };
  let rows = pack();
  // Long names that would need a third row share two rows of three instead, their names cut short.
  if (rows.length > 2) { const third = Math.floor((width - 8 - 2 * PILL_GAP) / 3); widths = widths.map(w => Math.min(w, third)); rows = pack(); }
  const place: { at: { x: number; y: number }; width: number }[] = items.map(() => ({ at: { x: 0, y: 0 }, width: 0 }));
  rows.forEach((row, r) => {
    let x = width / 2 - used(row) / 2;
    for (const i of row) { place[i] = { at: { x: x + widths[i] / 2, y: 196 + r * (PILL_HEIGHT + 10) }, width: widths[i] }; x += widths[i] + PILL_GAP; }
  });
  let a = 0;
  items.forEach((item, i) => {
    if (item.kind !== 'account') return;
    const side = a % 2 === 0 ? -1 : 1, step = Math.floor(a++ / 2);
    place[i] = { at: { x: width / 2 + side * (100 + step * 42), y: 316 }, width: 0 };
  });
  return place;
}

const GLYPHS = '0123456789abcdef';

/** A name mid-encryption: letters turn to hex from the left as `progress` runs 0 → 1, spaces kept.
 *  `seed` varies the glyphs between frames so it shimmers rather than sits. */
export function scramble(name: string, progress: number, seed: number) {
  const p = Math.min(1, Math.max(0, progress));
  const turned = Math.round(name.length * p);
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    out += i < turned && ch !== ' ' ? GLYPHS[(ch.charCodeAt(0) * 7 + seed * 13 + i * 5) % GLYPHS.length] : ch;
  }
  return out;
}

/** The path a traveller takes, as interpolation stops for its 0 → 1 rise: a small crouch, a slide into the beam
 *  above the Mac, then a rise that accelerates up it into the cloud, swaying a little (alternating sides) on the way. */
export function arc(index: number, width: number, from: { x: number; y: number }, to: { x: number; y: number }) {
  const side = index % 2 === 0 ? -1 : 1;
  const sway = Math.min(18, width * 0.05) * side;
  const input = [0, 0.1, 0.22, 0.38, 0.55, 0.72, 0.86, 1];
  const ease = (t: number) => t * t * (3 - 2 * t);
  const crouch = (t: number) => (t < 0.22 ? 9 * Math.sin(Math.PI * t / 0.22) : 0);
  const x = input.map(t => from.x + (to.x - from.x) * ease(Math.min(1, t / 0.5)) + sway * Math.sin(2 * Math.PI * t) * (1 - t));
  const y = input.map(t => from.y + (to.y - from.y) * Math.pow(t, 1.7) + crouch(t));
  return { input, x, y };
}
