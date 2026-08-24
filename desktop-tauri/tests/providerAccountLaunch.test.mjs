import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * Choosing an account is only real if it survives the whole way to the
 * process. This walks that path: launcher preference → spawn options → IPC →
 * the Rust request → the environment variable the CLI actually reads.
 */
test("the chosen account reaches the terminal it launches", () => {
  const configured = source("../src/lib/configuredLaunch.ts");
  const lifecycle = source("../src/state/terminalSpawnActions.ts");
  const ipc = source("../src/ipc/terminal.ts");
  const launch = source("../src-tauri/src/commands/terminal_launch.rs");
  const prepare = source("../src-tauri/src/commands/terminal_prepare.rs");

  assert.match(configured, /accountId: preferences\.accountByProvider\[agent\.id\] \?\? null/);
  assert.match(lifecycle, /accountId: options\?\.accountId \?\? null/);
  assert.match(ipc, /accountId: options\.accountId \?\? null/);
  assert.match(launch, /pub account_id: Option<String>/);
  assert.match(prepare, /select_launch_account\(&mut spec, &agent\.spec\.id, request\.account_id/);
  assert.match(launch, /spec\.env\.push\(\(name, value\)\)/);
});

/**
 * A pane keeps the account it started on for its whole life — a CLI reads its
 * credentials once — so both the restore and the relaunch paths have to carry
 * it. Resuming onto a different account would hunt for the conversation in a
 * folder that has never held it.
 */
test("a restored pane comes back on the account it ran as", () => {
  const restore = source("../src/lib/sessionRestore.ts");
  const relaunch = source("../src/state/terminalRelaunch.ts");
  const store = source("../src-tauri/src/session_store.rs");

  assert.match(restore, /accountId: pane\.accountId \?\? null/);
  assert.match(relaunch, /accountId: pane\.accountId/);
  assert.match(store, /pub account_id: Option<String>/);
});

/**
 * Claude keeps its transcripts inside whichever config folder it is pointed
 * at. Asking the first account whether a second account's conversation exists
 * reads the wrong folder and answers "No conversation found" for one that is
 * sitting right there.
 */
test("the resumable check reads the account's own transcripts", () => {
  const conversations = source("../src-tauri/src/commands/agent_conversations.rs");
  const ipc = source("../src/ipc/terminal.ts");
  const relaunch = source("../src/state/terminalRelaunch.ts");

  // Scoped to the agent as well as the account: Claude and Codex keep their
  // conversations under different roots, so resolving Claude's home to answer
  // about a Codex pane would search where no rollout has ever been written.
  assert.match(conversations, /pub fn detect\(agent: &str, account_id: Option<&str>\)/);
  assert.match(conversations, /Registry::load\(\)\s*\.home\(agent, account\)/);
  assert.match(conversations, /ConversationStore::detect\(&agent_id, account_id\.as_deref\(\)\)/);
  assert.doesNotMatch(
    conversations,
    /var_os\("CLAUDE_CONFIG_DIR"\)/,
    "the folder must come from the account, not from Vibyra's own environment",
  );
  assert.match(ipc, /\{ agentId, sessionId, accountId \}/);
  assert.match(relaunch, /pane\.accountId,/);
});

/**
 * Gemini's variable names the *parent* of its credential folder while the
 * other two name the folder itself. Collapsing that difference points the
 * probe at an empty directory and reports a signed-in account as signed out.
 */
test("each CLI is handed the path shape it actually expects", () => {
  const home = source("../src-tauri/src/provider_auth_home.rs");

  assert.match(home, /"codex" => Some\("CODEX_HOME"\)/);
  assert.match(home, /"claude" => Some\("CLAUDE_CONFIG_DIR"\)/);
  assert.match(home, /"gemini" => Some\("GEMINI_CLI_HOME"\)/);
  assert.match(home, /Some\(root\) if self\.provider == "gemini" => root\.join\("\.gemini"\)/);
});

/**
 * Switching a running pane is a relaunch, because a CLI reads its credentials
 * once. What makes it a switch rather than a loss is that the pane keeps its
 * slot and its output, and that the old conversation is left intact in the old
 * account's folder rather than deleted.
 */
test("switching a pane relaunches it in place without destroying anything", () => {
  const swap = source("../src/state/terminalAccountSwitch.ts");

  assert.match(swap, /replaces: id/, "the pane keeps its slot in the grid");
  assert.match(swap, /terminalSnapshot\(id\)/, "live output is captured before the switch");
  assert.match(swap, /replaySnapshot,/, "its output stays on screen");
  assert.match(swap, /resume: false/);
  assert.match(swap, /agentSessionId: null/, "the new account starts its own conversation");
  assert.doesNotMatch(
    swap,
    /get\(\)\.close\(/,
    "closing through the store would drop the pane and take its slot with it",
  );
  assert.match(
    swap,
    /if \(!launched\) return;[\s\S]*destroySession\(id\)/,
    "the working process survives until its replacement has opened",
  );
});

/**
 * A pane that never started a conversation has nothing to leave behind, so
 * asking it to confirm is a prompt about nothing. A failed lookup asks anyway:
 * the safe direction is to interrupt, not to drop a conversation silently.
 */
test("only a pane with a conversation is worth stopping to confirm", () => {
  const swap = source("../src/state/terminalAccountSwitch.ts");
  const control = source("../src/components/terminal/PaneAccountControl.tsx");

  assert.match(swap, /if \(!pane\.agentSessionId\) return false;/);
  assert.match(swap, /\.catch\(\s*\(\) => true,?\s*\)/);
  assert.match(control, /if \(await switchLosesConversation\(pane\)\) \{/);
  assert.match(control, /accounts\.length < 2\) return null/, "one account is not a choice");
});
