// What a preview keeps of a character's look: its foreground, and whether it is
// bold or dim. Backgrounds are dropped — at thumbnail size they only add noise.
export interface Style {
  color?: number | string;
  bold?: boolean;
  dim?: boolean;
}
export const plain: Style = {};

const hex = (value: number) =>
  Math.max(0, Math.min(255, value || 0))
    .toString(16)
    .padStart(2, '0');
const rgb = (r: number, g: number, b: number) => `#${hex(r)}${hex(g)}${hex(b)}`;
// xterm's 256-colour table: the 16 named colours, a 6×6×6 cube, then 24 greys.
function indexed(index: number): number | string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) return undefined;
  if (index < 16) return index;
  if (index >= 232) {
    const grey = 8 + (index - 232) * 10;
    return rgb(grey, grey, grey);
  }
  const level = (step: number) => (step ? 55 + step * 40 : 0);
  const cube = index - 16;
  return rgb(level(Math.floor(cube / 36)), level(Math.floor(cube / 6) % 6), level(cube % 6));
}
/** `38;5;n` and `38;2;r;g;b`, in either the semicolon or the colon form. */
function extended(parts: number[]): { color: number | string | undefined; used: number } {
  if (parts[0] === 5) return { color: indexed(parts[1]!), used: 2 };
  if (parts[0] === 2) return { color: rgb(parts[1]!, parts[2]!, parts[3]!), used: 4 };
  return { color: undefined, used: 0 };
}

/** The style after one SGR sequence (the parameters of `ESC [ … m`). */
export function applySgr(style: Style, params: string): Style {
  const codes = params === '' ? ['0'] : params.split(';');
  let next: Style = { ...style };
  for (let i = 0; i < codes.length; i++) {
    const part = codes[i]!;
    if (part.includes(':')) {
      const sub = part.split(':').map(Number);
      // The colon form may carry an empty colour-space id: `38:2::r:g:b`.
      if (sub[1] === 2 && sub.length === 6) sub.splice(2, 1);
      if (sub[0] === 38) next.color = extended(sub.slice(1)).color;
      continue;
    }
    const code = Number(part || 0);
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code >= 30 && code <= 37) next.color = code - 30;
    else if (code >= 90 && code <= 97) next.color = code - 82;
    else if (code === 39) delete next.color;
    else if (code === 38 || code === 48) {
      const { color, used } = extended(codes.slice(i + 1, i + 5).map(Number));
      if (code === 38) next.color = color;
      i += used;
    }
  }
  return next;
}

// Characters that take no cell of their own: combining marks, joiners and
// variation selectors ride on the character before them.
const zero: [number, number][] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0x1f3fb, 0x1f3ff],
  [0xe0100, 0xe01ef],
];
// Characters drawn two cells wide: CJK, Hangul, full-width forms and emoji.
const wide: [number, number][] = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f3],
  [0x2614, 0x2615],
  [0x26a1, 0x26a1],
  [0x2705, 0x2705],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x2753, 0x2757],
  [0x2b50, 0x2b55],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
];
const within = (code: number, ranges: [number, number][]) =>
  ranges.some(([from, to]) => code >= from && code <= to);
export const cellWidth = (code: number) => (within(code, zero) ? 0 : within(code, wide) ? 2 : 1);
