import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewLines } from '../src/terminal/preview';
import { TerminalScreen } from '../src/terminal/screen';

const e = '[';
const text = (screen: TerminalScreen) => screen.lines().map(line => line.map(span => span.text).join(''));
const play = (output: string, cols = 40, rows = 8) => {
  const screen = new TerminalScreen(cols, rows);
  screen.write(output);
  return text(screen);
};
const flat = (output: string, cols = 40, rows = 8, count = 5) =>
  previewLines(output, cols, rows, count).map(line => line.map(span => span.text).join(''));

test('plain output lands line by line', () => {
  assert.deepEqual(play('one\r\ntwo\r\n').slice(0, 3), ['one', 'two', '']);
});

test('a carriage return rewrites the line it is on', () => {
  assert.deepEqual(play('Downloading 40%\rDownloading 90%')[0], 'Downloading 90%');
});

test('a line redrawn in place is kept once, not once per frame', () => {
  // How Claude Code and Codex update: erase the line, step up, write it again.
  const frame = (seconds: number) => `${e}2K\r• Working (${seconds}s)`;
  const lines = play(`${frame(1)}\r\n${e}1A${frame(2)}\r\n${e}1A${frame(3)}`);
  assert.equal(lines[0], '• Working (3s)');
  assert.equal(lines.filter(line => line.includes('Working')).length, 1);
});

test('output wraps at the width the computer draws at', () => {
  assert.deepEqual(play('abcdefghij', 4).slice(0, 3), ['abcd', 'efgh', 'ij']);
});

test('the cursor can be placed anywhere and the screen cleared', () => {
  assert.equal(play(`first${e}3;2Hsecond`)[2], ' second');
  assert.deepEqual(play(`kept${e}2J`)[0], '');
});

test('a full-screen program draws on its own page and gives the first one back', () => {
  const lines = play(`shell${e}?1049hfull screen${e}?1049l`);
  assert.equal(lines[0], 'shell');
  assert.equal(play(`shell${e}?1049hfull screen`)[0], 'full screen');
});

test('output scrolls once the screen is full', () => {
  const lines = play('1\r\n2\r\n3\r\n4\r\n', 10, 3);
  assert.deepEqual(lines, ['3', '4', '']);
});

test('colour, weight and dimming survive to the preview', () => {
  const screen = new TerminalScreen(40, 4);
  screen.write(`${e}1;32mVITE${e}0m ${e}90mready${e}0m ${e}38;2;91;124;250mblue${e}0m`);
  const spans = screen.lines()[0]!;
  assert.deepEqual(spans.map(span => span.text), ['VITE', ' ', 'ready', ' ', 'blue']);
  assert.deepEqual(spans[0]!.style, { bold: true, color: 2 });
  assert.equal(spans[2]!.style.color, 8);
  assert.equal(spans[4]!.style.color, '#5b7cfa');
});

test('window titles and other strings never reach the screen', () => {
  assert.equal(play(`${e}?25l]0;~/Projects/studionpm run dev${e}?25h`)[0], 'npm run dev');
});

test('a preview keeps the last lines, closing up blank ones', () => {
  assert.deepEqual(flat('one\r\n\r\n\r\n\r\ntwo\r\n\r\n\r\n'), ['one', '', 'two']);
  assert.deepEqual(flat('1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n', 10, 12, 3), ['5', '6', '7']);
});

test('a preview of a terminal with nothing in it has no lines', () => {
  assert.deepEqual(flat(''), []);
  assert.deepEqual(flat(`${e}2J${e}H`), []);
});
