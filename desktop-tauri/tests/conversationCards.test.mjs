import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { openConversationCards, splitConversationRows } from "../src/lib/conversationCards.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const saved = (id) => ({ id, status: "interrupted" });
const live = (id) => ({ id, status: "running" });

/**
 * The bug this rule exists for: quitting Vibyra stops every conversation, and
 * the engine keeps them all, so a grid of "everything except what was closed
 * by hand" opened every past conversation again on the next launch — as chat
 * pages, because the stock CLI can only attach to a live one.
 */
test("a conversation saved from an earlier run has no card", () => {
  assert.deepEqual(openConversationCards([saved("c-1"), saved("c-2")], [], []), []);
});

test("a live conversation has one, and keeps it after it stops", () => {
  const open = openConversationCards([live("c-1"), saved("c-2")], [], []);
  assert.deepEqual(open, ["c-1"], "only the live one is on the grid");
  // Its process ends — from the phone, or by finishing — and the person keeps
  // the transcript in front of them rather than watching the pane vanish.
  assert.deepEqual(openConversationCards([saved("c-1"), saved("c-2")], open, []), ["c-1"]);
});

test("opening a saved conversation from the terminals list puts its card up", () => {
  assert.deepEqual(openConversationCards([saved("c-1"), saved("c-2")], ["c-2"], []), ["c-2"]);
});

test("closing a card keeps it down while its conversation is still running", () => {
  assert.deepEqual(openConversationCards([live("c-1")], ["c-1"], ["c-1"]), []);
});

/**
 * A list read a moment before a launch does not know about the conversation
 * that launch just started. Answering it by taking that card down again is
 * how a pane blinks out from under the person, so the set only ever grows.
 */
test("a list that predates a card does not take the card down", () => {
  assert.deepEqual(openConversationCards([], ["c-1"], []), ["c-1"]);
  // And the same list twice answers the same, rather than shuffling the grid.
  const sessions = [live("c-2"), saved("c-3")];
  const once = openConversationCards(sessions, ["c-1"], []);
  assert.deepEqual(once, ["c-1", "c-2"]);
  assert.deepEqual(openConversationCards(sessions, once, []), once);
});

test("both surfaces draw their cards from the live list", () => {
  // So an id left behind by a conversation the engine no longer lists — a
  // removed project's, say — draws nothing on either screen.
  assert.match(source("../src/components/terminal/TerminalStage.tsx"), /conversations\.sessions\.filter/);
  assert.match(source("../src/lib/phoneWorkspace.ts"), /chats\.sessions\.filter/);
});

/**
 * One set, two surfaces: the phone lists the terminals the Mac's grid draws,
 * so a card that is not up here must not be a terminal there either.
 */
test("the grid and the phone draw the same set of cards", () => {
  const stage = source("../src/components/terminal/TerminalStage.tsx");
  assert.match(stage, /conversations\.open\.includes\(s\.id\)/, "the grid draws the open cards");
  assert.doesNotMatch(stage, /!conversations\.dismissed\.includes/, "not everything minus the dismissals");
  const store = source("../src/state/conversationTerminalStore.ts");
  assert.match(store, /openConversationCards\(sessions, get\(\)\.open, get\(\)\.dismissed\)/);
  assert.match(store, /readConversationLayout/, "the explicit open set survives a quit");
  const phone = source("../src/lib/phoneWorkspace.ts");
  assert.match(phone, /chats\.sessions\.filter\(\(chat\) => chats\.open\.includes\(chat\.id\)\)/);
  assert.match(source("../src/lib/phoneWorkspaceSync.ts"), /open: chats\.open/);
});

/**
 * The bug this rule exists for: the engine hands over every conversation a
 * project has ever had, and the navigation column drew all of them as
 * terminals. Four open terminals read as twenty-four, because a chat saved
 * last week was drawn exactly like the one running now.
 */
test("the terminals list is what is open, and the rest is history", () => {
  const sessions = [live("c-1"), saved("c-2"), saved("c-3")];
  const { live: open, earlier } = splitConversationRows(sessions, ["c-1"]);
  assert.deepEqual(open.map((s) => s.id), ["c-1"]);
  assert.deepEqual(earlier.map((s) => s.id), ["c-2", "c-3"]);
});

test("a chat that finished this run stays a terminal while its card is up", () => {
  // Its process ended, the card did not: the column agrees with the grid.
  const { live: open, earlier } = splitConversationRows([saved("c-1")], ["c-1"]);
  assert.deepEqual(open.map((s) => s.id), ["c-1"]);
  assert.deepEqual(earlier, []);
});

test("a running conversation whose card was closed is still a terminal", () => {
  // Closing a card does not stop the conversation, so hiding it in the history
  // would leave a running CLI with nowhere in the column to say so.
  const { live: open, earlier } = splitConversationRows([live("c-1")], []);
  assert.deepEqual(open.map((s) => s.id), ["c-1"]);
  assert.deepEqual(earlier, []);
});

test("the navigation column splits its rows by that rule", () => {
  const list = source("../src/components/rail/SessionList.tsx");
  assert.match(list, /splitConversationRows\(sessions\.filter\(s => s\.projectId === \(projectId \?\? activeId\)\), open\)/);
  assert.doesNotMatch(list, /Earlier chats/, "closed history stays out of the everyday rail");
  assert.match(source("../src/components/layout/ProjectPickerMenu.tsx"), /Saved history/, "saved chats remain reachable from the project menu");
  assert.match(source("../src/components/layout/ProjectSwitcher.tsx"), /setHistoryOpen\(true\)/);
  assert.doesNotMatch(list, /<ConversationTerminalRows sessions={live}/, "the list draws matches, so search reaches every row");
  // A project whose terminals are all conversations still has a Terminals
  // section: asking the pane store alone emptied it for Codex.
  assert.match(source("../src/components/layout/WorkspaceTree.tsx"), /\+ splitConversationRows\(sessions\.filter/, "the project count includes live conversations");
});
