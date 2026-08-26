import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * The account chosen in Settings → Integrations is only real if it survives
 * the whole way to the process: active account → spawn options → IPC → the
 * Rust request → the environment variable the CLI reads. Launchers name no
 * account of their own; only relaunch and switch paths pass one.
 */
test("the active account reaches the terminal it launches", () => {
  const configured = source("../src/lib/configuredLaunch.ts");
  const lifecycle = source("../src/state/terminalSpawnActions.ts");
  const ipc = source("../src/ipc/terminal.ts");
  const launch = source("../src-tauri/src/commands/terminal_launch.rs");
  const prepare = source("../src-tauri/src/commands/terminal_prepare.rs");

  assert.doesNotMatch(
    configured,
    /accountId:/,
    "launchers must not override the account chosen in Settings → Integrations",
  );
  assert.match(
    lifecycle,
    /options\?\.accountId !== undefined \? options\.accountId : launchAccountId\(agent\.id\)/,
    "an explicit account (relaunch, switch) wins; a fresh launch falls back",
  );
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
 * The conversation goes with the pane. Transcripts live inside whichever
 * credential folder created them, so the new account has never seen this chat
 * — but a transcript is only a file, and copying it across is enough for the
 * CLI to resume from it. Without that, switching account to escape a spent
 * balance would cost the user the work they were in the middle of.
 */
test("switching a pane carries its conversation onto the new account", () => {
  const swap = source("../src/state/terminalAccountSwitch.ts");
  const ipc = source("../src/ipc/terminal.ts");
  const carry = source("../src-tauri/src/commands/conversation_carry.rs");

  assert.match(swap, /carryAgentConversation\(/, "the transcript is copied before the relaunch");
  assert.match(
    swap,
    /resume: carried/,
    "only a conversation that actually arrived is resumed",
  );
  assert.match(swap, /agentSessionId: carried \? pane\.agentSessionId : null/);
  assert.match(ipc, /invoke<boolean>\("carry_agent_conversation"/);

  // Copied, not moved: the chat still belongs to the account that paid for it,
  // and switching back has to find it there.
  assert.match(carry, /std::fs::copy\(source, destination\)/);
  assert.doesNotMatch(carry, /std::fs::rename|remove_file/);
});

/**
 * Switching is offered where an account is chosen, not on the pane. Running
 * out of credits happens to an account, so the fix is to move everything that
 * was spending them — asking pane by pane made the common case the tedious one.
 */
test("accounts are switched from Integrations, not from the terminal", () => {
  const use = source("../src/components/settings/ProviderAccountUse.tsx");
  const row = source("../src/components/settings/ProviderAccountRow.tsx");
  const badge = source("../src/components/terminal/PaneAccountBadge.tsx");

  assert.match(row, /<ProviderAccountUse provider=\{provider\} account=\{account\} \/>/);
  assert.match(use, /switchProviderAccount\(provider\.runtimeId, account\.accountId\)/);

  // The pane keeps the answer to "did that reach this one", and nothing more.
  assert.doesNotMatch(badge, /switchAccount|<button/, "the pane no longer switches anything");
  assert.match(badge, /accounts\.length < 2\) return null/, "one account is not a choice");
});

/**
 * A relaunch cuts off whatever the agent was in the middle of saying, and that
 * answer does not come back. Panes merely waiting on the user are not busy in
 * this sense: nothing is in flight, and the question survives the restart.
 */
test("a switch stops to confirm only when it would interrupt an answer", () => {
  const use = source("../src/components/settings/ProviderAccountUse.tsx");
  const swap = source("../src/state/providerAccountSwitch.ts");

  assert.match(swap, /activity\[pane\.id\] === "working"/);
  assert.match(use, /workingPanes\(provider\.runtimeId\)\.length === 0/);
});

/**
 * The choice has to outlive the panes it moved, or the next terminal opened
 * quietly reaches for the credits the user just walked away from.
 */
test("the chosen account is remembered for terminals opened later", () => {
  const swap = source("../src/state/providerAccountSwitch.ts");
  const spawn = source("../src/state/terminalSpawnActions.ts");
  const settings = source("../src-tauri/crates/vibyra-core/src/settings.rs");

  assert.match(swap, /activeProviderAccounts: \{/);
  assert.match(spawn, /function launchAccountId\(providerId: string\)/);
  assert.match(settings, /pub active_provider_accounts: BTreeMap<String, String>/);
});

/**
 * Panes belonging to other companies are never touched: a Claude switch has
 * nothing to say about a Codex chat, and relaunching one would be a bug the
 * user reads as Vibyra restarting terminals at random.
 */
test("switching one company leaves the other companies' terminals alone", () => {
  const swap = source("../src/state/providerAccountSwitch.ts");

  assert.match(swap, /pane\.agentId === providerId && pane\.status !== "exited"/);
  assert.match(swap, /\(pane\) => pane\.accountId !== target/, "panes already there are left alone");
});
