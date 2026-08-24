import assert from "node:assert/strict";
import test from "node:test";

import { asksForChatTitle, awaitsChatTitle } from "../src/lib/terminalChatTitle.ts";
import {
  acceptedChatTitle,
  normalizeTerminalChatTitle,
  terminalDisplayTitle,
} from "../src/lib/terminalTitle.ts";

// Which of a pane's several possible names it shows, and which of them is
// allowed to replace one it already has.

test("manual and chat-aware titles outrank a CLI's generic OSC title", () => {
  const pane = {
    title: "GPT-5.6 Sol",
    osc: "⠋ Vibyra",
    chatTitle: "Fix terminal chat titles",
    customTitle: null,
  };
  assert.equal(terminalDisplayTitle(pane), "Fix terminal chat titles");
  assert.equal(terminalDisplayTitle({ ...pane, customTitle: "My terminal" }), "My terminal");
});

test("protocol-corrupted generated and OSC titles fall back safely", () => {
  const protocolNoise = "]10;rgb:eeee/eaea/f8f8\\]11;rgb:0b0b/0b0b/0b0b\\";
  const pane = {
    title: "GPT-5.6 Sol",
    osc: "Codex",
    chatTitle: protocolNoise,
    customTitle: null,
  };
  assert.equal(terminalDisplayTitle(pane), "Codex");
  assert.equal(terminalDisplayTitle({ ...pane, osc: protocolNoise }), "GPT-5.6 Sol");
  assert.equal(normalizeTerminalChatTitle(`Fix titles ${protocolNoise}`), null);
  assert.equal(normalizeTerminalChatTitle("Fix titles ]4;0;rgb:eeee/eaea/f8f8"), null);
});

test("only a running AI pane without a name is still waiting for one", () => {
  const pane = { agentId: "codex", status: "running", chatTitle: null };
  assert.equal(awaitsChatTitle(pane), true);
  assert.equal(awaitsChatTitle({ ...pane, status: "suspended" }), false);
  assert.equal(awaitsChatTitle({ ...pane, agentId: "claude" }), false);
  assert.equal(awaitsChatTitle({ ...pane, agentId: "shell" }), false);
  assert.equal(awaitsChatTitle({ ...pane, chatTitle: "Run the mobile app" }), false);
  // A name that was corrupted before it was saved does not count as one.
  assert.equal(awaitsChatTitle({ ...pane, chatTitle: "]10;rgb:eeee/eaea/f8f8" }), true);
});

test("the submitted prompt corrects a keystroke guess, and never the reverse", () => {
  const guessed = { customTitle: null, chatTitle: "permissions", osc: null, title: "GPT-5.6 Sol" };
  assert.equal(acceptedChatTitle(guessed, "Run the mobile app", true), "Run the mobile app");
  assert.equal(acceptedChatTitle(guessed, "Continue the other thing", false), null);
  // Re-reading the same transcript must not churn the pane.
  const named = { ...guessed, chatTitle: "Run the mobile app" };
  assert.equal(acceptedChatTitle(named, "Run the mobile app", true), null);
  // An unnamed pane takes either source.
  const unnamed = { ...guessed, chatTitle: null };
  assert.equal(acceptedChatTitle(unnamed, "Fix terminal titles", false), "Fix terminal titles");
  assert.equal(acceptedChatTitle(unnamed, "]10;rgb:eeee/eaea/f8f8", true), null);
});

test("a name restored from an earlier session is checked once, then left alone", () => {
  const named = { agentId: "codex", status: "running", chatTitle: "permissions" };
  assert.equal(asksForChatTitle(named, false), true);
  assert.equal(asksForChatTitle(named, true), false);
  // A pane with no name is asked until the agent answers.
  const unnamed = { ...named, chatTitle: null };
  assert.equal(asksForChatTitle(unnamed, true), true);
  // A pane that is not an AI chat is never asked.
  assert.equal(asksForChatTitle({ ...named, agentId: "shell" }, false), false);
  assert.equal(asksForChatTitle({ ...named, status: "suspended" }, false), false);
});
