import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findPrompt } from '../src/terminal/promptChoices';

// Real screens: a Claude Code 2.1.282 session recorded in a pty and replayed
// through the phone's own TerminalScreen, paths shortened.
const screen = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8').split('\n');

test('Claude Code permission prompt, boxed, with a wrapped option', () => {
  const prompt = findPrompt([
    '╭──────────────────────────────────────────╮',
    '│ Bash command                             │',
    '│   echo hi > notes.txt                    │',
    '│ Do you want to proceed?                  │',
    '│ ❯ 1. Yes                                 │',
    '│   2. Yes, and don\'t ask again for echo   │',
    '│      commands in /Users/me/pocket        │',
    '│   3. No, and tell Claude what to do      │',
    '│      differently (esc)                   │',
    '╰──────────────────────────────────────────╯',
    '',
  ]);
  assert.equal(prompt?.question, 'Do you want to proceed?');
  assert.deepEqual(prompt?.options.map((o) => o.keys), ['1', '2', '3']);
  assert.equal(prompt?.options[1].label, "Yes, and don't ask again for echo commands in /Users/me/pocket");
  assert.equal(prompt?.options[2].label, 'No, and tell Claude what to do differently (esc)');
});

test('Codex and Gemini approval prompts with a key hint underneath', () => {
  const codex = findPrompt([
    'Would you like to run the following command?',
    '  $ npm install',
    '› 1. Yes, proceed (y)',
    '  2. Yes, and don\'t ask again for this command (p)',
    '  3. No, and tell Codex what to do differently (esc)',
    'Press enter to confirm or esc to cancel',
  ]);
  assert.deepEqual(codex?.options.map((option) => option.keys), ['y', 'p', '\x1b']);
  assert.equal(codex?.context, '$ npm install');
  assert.equal(findPrompt([
    'Allow execution of: \'rm\'?',
    '● 1. Allow once',
    '  2. Allow for this session',
    '  3. No, suggest changes (esc)',
  ])?.question, "Allow execution of: 'rm'?");
});

test('Codex local command approval shows the command and reason, even when the reason asks a question', () => {
  const prompt = findPrompt([
    'Would you like to run the following command?',
    'Environment: local',
    'Reason: May I start the local website on your Mac’s Wi-Fi address so Safari',
    'on your paired iPhone can access it?',
    '$ HKE_LOCAL_HOST=192.168.1.118 HKE_LOCAL_PORT=8010 HKE_ALLOW_LAN=1 npm run start:website',
    '› 1. Yes, proceed (y)',
    '  2. Yes, and don\'t ask again for commands that start with `HKE_LOCAL_HOST=192.168.1.118` (p)',
    '  3. No, and tell Codex what to do differently (esc)',
  ]);
  assert.equal(prompt?.question, 'Would you like to run the following command?');
  assert.match(prompt?.context ?? '', /Environment: local/);
  assert.match(prompt?.context ?? '', /Safari/);
  assert.match(prompt?.context ?? '', /HKE_ALLOW_LAN=1 npm run start:website/);
  assert.deepEqual(prompt?.options.map((option) => option.keys), ['y', 'p', '\x1b']);
});

test('Codex menu without explicit shortcuts is not guessed into an approval', () => {
  assert.equal(findPrompt([
    'Would you like to run the following command?', '$ npm install',
    '› 1. Yes, proceed', '  2. No',
  ]), null);
});

test('Codex hotkeys are not mistaken for row numbers when its title has scrolled away', () => {
  assert.equal(findPrompt([
    'Reason: May I open the website on your iPhone?',
    '$ HKE_ALLOW_LAN=1 npm run start:website',
    '› 1. Yes, proceed (y)',
    "  2. Yes, and don't ask again (p)",
    '  3. No (esc)',
  ]), null);
});

test('ordinary numbered text is not a prompt', () => {
  // The agent's own list, already answered: the input line sits underneath.
  assert.equal(findPrompt(['Which should I do?', '1. Rename', '2. Delete', '', '> ']), null);
  // No question above the list.
  assert.equal(findPrompt(['Steps:', '1. Install', '2. Build']), null);
  // A list that does not start at 1, or skips a number.
  assert.equal(findPrompt(['Continue?', '2. Yes', '3. No']), null);
  assert.equal(findPrompt(['Continue?', '1. Yes', '3. No']), null);
  // A single option.
  assert.equal(findPrompt(['Continue?', '1. Yes']), null);
  // Scrolled far past: too much output under it.
  assert.equal(findPrompt(['Continue?', '1. Yes', '2. No', 'a', 'b', 'c', 'd']), null);
});

test('answered Codex approval disappears after terminal output resumes', () => {
  assert.equal(findPrompt([
    'Would you like to run the following command?',
    '$ printf vibyra-approval-probe',
    '> 1. Yes, proceed (y)',
    '  2. Yes, and don\'t ask again (p)',
    '  3. No (esc)',
    "Approval probe selected: b'\\x1b'",
    'ellis@Mac HKE %',
  ]), null);
});

test('a real Claude Code 2.1 permission prompt, as the phone draws it', () => {
  const prompt = findPrompt(screen('claude-permission-screen.txt'));
  assert.equal(prompt?.question, 'Do you want to proceed?');
  assert.deepEqual(prompt?.options, [
    { label: 'Yes', keys: '1' },
    { label: 'Yes, and always allow access to /Users/me/ pocket from this project', keys: '2' },
    { label: 'No', keys: '3' },
  ]);
});

test('a real Claude Code folder trust menu moves its cursor, then confirms', () => {
  const prompt = findPrompt(screen('claude-trust-screen.txt'));
  assert.match(prompt?.question ?? '', /one you trust\?/);
  assert.deepEqual(prompt?.options, [
    { label: 'No, exit', keys: '\r' },
    { label: 'Yes, I trust this folder', keys: '\x1b[B\r' },
  ]);
});

test('a working Claude screen with its empty input box is not a prompt', () => {
  assert.equal(findPrompt(['❯ Use your Bash tool', '  Running 1 shell command…', '─────', '❯', '─────', '  ⏸ manual mode on · esc to interrupt']), null);
});
