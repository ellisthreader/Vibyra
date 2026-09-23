import type { Encoded } from './encode';
import { sideFor } from './tables';

/**
 * The drawn symbol: the patterns a scanner finds first, the data woven between them,
 * and the mask that keeps the result from looking like anything but noise. Every
 * module is either part of the frame (`fixed`) or data, because only data is masked.
 */
export interface Symbol {
  side: number;
  dark: boolean[][];
}
type Grid = { side: number; dark: boolean[][]; fixed: boolean[][] };

const grid = (side: number): Grid => ({
  side,
  dark: Array.from({ length: side }, () => Array<boolean>(side).fill(false)),
  fixed: Array.from({ length: side }, () => Array<boolean>(side).fill(false)),
});
const inside = (grid: Grid, row: number, col: number) =>
  row >= 0 && col >= 0 && row < grid.side && col < grid.side;
function put(grid: Grid, row: number, col: number, dark: boolean) {
  if (!inside(grid, row, col)) return;
  grid.dark[row][col] = dark;
  grid.fixed[row][col] = true;
}

export function draw({ version, spec, codewords }: Encoded): Symbol {
  const canvas = grid(sideFor(version));
  frame(canvas, spec.align);
  if (version >= 7) versionBits(canvas, version);
  reserveFormat(canvas);
  weave(canvas, codewords);
  return best(canvas);
}
/** Finders and their separators, the alignment patterns, the timing lines, the dark module. */
function frame(canvas: Grid, align: number[]) {
  const last = canvas.side - 7;
  for (const [top, left] of [
    [0, 0],
    [0, last],
    [last, 0],
  ] as const) {
    for (let row = -1; row <= 7; row += 1)
      for (let col = -1; col <= 7; col += 1) {
        const ring = Math.max(Math.abs(row - 3), Math.abs(col - 3));
        put(canvas, top + row, left + col, ring !== 2 && ring <= 3);
      }
  }
  for (const row of align)
    for (const col of align) {
      if (canvas.fixed[row][col]) continue;
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1)
          put(canvas, row + dy, col + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
    }
  for (let at = 8; at < canvas.side - 8; at += 1) {
    put(canvas, 6, at, at % 2 === 0);
    put(canvas, at, 6, at % 2 === 0);
  }
  put(canvas, canvas.side - 8, 8, true);
}
function reserveFormat(canvas: Grid) {
  for (let i = 0; i < 9; i += 1) {
    if (!canvas.fixed[8][i]) put(canvas, 8, i, false);
    if (!canvas.fixed[i][8]) put(canvas, i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!canvas.fixed[8][canvas.side - 1 - i]) put(canvas, 8, canvas.side - 1 - i, false);
    if (!canvas.fixed[canvas.side - 1 - i][8]) put(canvas, canvas.side - 1 - i, 8, false);
  }
}
function versionBits(canvas: Grid, version: number) {
  let rest = version;
  for (let i = 0; i < 12; i += 1) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
  const bits = (version << 12) | rest;
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const far = canvas.side - 11 + (i % 3);
    const near = Math.floor(i / 3);
    put(canvas, near, far, dark);
    put(canvas, far, near, dark);
  }
}
/** The data, up the right edge and down the next in two-module columns, skipping the
 *  timing line at column 6 and every module the frame already owns. */
function weave(canvas: Grid, codewords: Uint8Array) {
  let bit = 0;
  for (let right = canvas.side - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < canvas.side; step += 1) {
      const upward = ((canvas.side - 1 - right) & 2) === 0;
      const row = upward ? canvas.side - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (canvas.fixed[row][col]) continue;
        const byte = codewords[bit >> 3];
        canvas.dark[row][col] = byte !== undefined && ((byte >> (7 - (bit & 7))) & 1) === 1;
        bit += 1;
      }
    }
  }
}
const masks: ((row: number, col: number) => boolean)[] = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];
/** The mask the specification's four penalties like most, with its format bits written. */
function best(canvas: Grid): Symbol {
  let chosen: Symbol | null = null;
  let lowest = Infinity;
  for (let mask = 0; mask < masks.length; mask += 1) {
    const dark = canvas.dark.map((row, y) =>
      row.map((module, x) => (canvas.fixed[y][x] ? module : module !== masks[mask](y, x))),
    );
    const attempt = { side: canvas.side, dark, fixed: canvas.fixed };
    formatBits(attempt, mask);
    const score = penalty(attempt.dark, canvas.side);
    if (score < lowest) {
      lowest = score;
      chosen = { side: canvas.side, dark };
    }
  }
  return chosen!;
}
function formatBits(canvas: Grid, mask: number) {
  // Level M is 0b00, then the mask, then ten BCH bits, then the specification's mask
  // over the lot so an all-zero format never looks like a valid one.
  const data = mask;
  let rest = data << 10;
  for (let i = 4; i >= 0; i -= 1) if ((rest >>> (i + 10)) & 1) rest ^= 0x537 << i;
  const bits = ((data << 10) | (rest & 0x3ff)) ^ 0x5412;
  const at = (row: number, col: number, i: number) => {
    canvas.dark[row][col] = ((bits >>> i) & 1) === 1;
  };
  for (let i = 0; i <= 5; i += 1) at(i, 8, i);
  at(7, 8, 6);
  at(8, 8, 7);
  at(8, 7, 8);
  for (let i = 9; i < 15; i += 1) at(8, 14 - i, i);
  for (let i = 0; i < 8; i += 1) at(8, canvas.side - 1 - i, i);
  for (let i = 8; i < 15; i += 1) at(canvas.side - 15 + i, 8, i);
}
function penalty(dark: boolean[][], side: number): number {
  let score = 0;
  let darkCount = 0;
  const line = (get: (at: number) => boolean) => {
    let run = 1;
    for (let at = 1; at < side; at += 1) {
      if (get(at) === get(at - 1)) {
        run += 1;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  };
  for (let i = 0; i < side; i += 1) {
    line((at) => dark[i][at]);
    line((at) => dark[at][i]);
    for (const module of dark[i]) if (module) darkCount += 1;
  }
  for (let row = 0; row < side - 1; row += 1)
    for (let col = 0; col < side - 1; col += 1) {
      const first = dark[row][col];
      if (
        first === dark[row][col + 1] &&
        first === dark[row + 1][col] &&
        first === dark[row + 1][col + 1]
      )
        score += 3;
    }
  score += finderLike(dark, side);
  return score + 10 * Math.floor(Math.abs((darkCount * 100) / (side * side) - 50) / 5);
}
/** The 1:1:3:1:1 run a scanner reads as a finder, anywhere it does not belong. */
function finderLike(dark: boolean[][], side: number): number {
  const shape = [true, false, true, true, true, false, true];
  let score = 0;
  const look = (get: (at: number) => boolean) => {
    for (let at = 0; at + 7 <= side; at += 1) {
      if (shape.some((want, offset) => get(at + offset) !== want)) continue;
      const before = [at - 4, at - 3, at - 2, at - 1].every((i) => i < 0 || !get(i));
      const after = [at + 7, at + 8, at + 9, at + 10].every((i) => i >= side || !get(i));
      if (before || after) score += 40;
    }
  };
  for (let i = 0; i < side; i += 1) {
    look((at) => dark[i][at]);
    look((at) => dark[at][i]);
  }
  return score;
}
