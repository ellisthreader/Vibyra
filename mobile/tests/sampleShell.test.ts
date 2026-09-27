import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleShellInput } from '../src/demo/sampleShell';

const BACKSPACE = String.fromCharCode(0x7f);
const ERASE = '\b \b';

test('the sample shell echoes keys, edits the line with backspace and enters it on return', () => {
  const shell = { line: '' };
  assert.deepEqual(sampleShellInput(shell, 'ls'), { echo: 'ls', entered: [] });
  assert.deepEqual(sampleShellInput(shell, BACKSPACE), { echo: ERASE, entered: [] });
  assert.equal(shell.line, 'l');
  const { echo, entered } = sampleShellInput(shell, 's -la\r');
  assert.deepEqual(entered, ['ls -la']);
  assert.match(echo, /^s -la\r\nSample only — command not executed\.\r\n\$ $/);
  assert.equal(shell.line, '');
});

test('return on an empty line is just a new prompt, and a pasted line arrives whole', () => {
  const shell = { line: '' };
  assert.deepEqual(sampleShellInput(shell, '\r'), { echo: '\r\n$ ', entered: [] });
  assert.deepEqual(sampleShellInput(shell, 'git status\r').entered, ['git status']);
});
