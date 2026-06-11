import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendDesktopPromptTranscript } from "./desktopPromptTranscript.mjs";

test("prompt transcript log appends exact spoken and typed prompts with context", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vibyra-prompt-transcript-"));
  const filePath = join(directory, "Prompt Transcripts.md");
  try {
    const turn = await appendDesktopPromptTranscript({
      projectId: "project-1",
      projectName: "SaaS",
      model: "openai/gpt-5",
      sessionId: "desktop-chat:chat-1",
      source: "ai-talk",
      terminalId: "terminal-1",
      terminalName: "Builder",
      audioBase64: "must-not-be-written",
      prompt: "Build the login page.\nKeep the exact V logo."
    }, { filePath, now: new Date("2026-06-10T20:30:00.000Z") });
    await appendDesktopPromptTranscript({
      actions: [{ type: "open_terminals", count: 1 }],
      event: "outcome",
      model: "openai/gpt-5",
      response: "I will open a terminal.",
      result: "Opening one terminal.",
      sessionId: turn.sessionId,
      source: "ai-talk",
      status: "completed",
      turnId: turn.turnId
    }, { filePath, now: new Date("2026-06-10T20:30:02.000Z") });
    await appendDesktopPromptTranscript({
      source: "terminal-dictation",
      terminalId: "terminal-2",
      terminalName: "Reviewer",
      prompt: "Run the tests."
    }, { filePath, now: new Date("2026-06-10T20:31:00.000Z") });
    await appendDesktopPromptTranscript({
      projectName: "SaaS",
      source: "desktop-chat",
      prompt: "Review the voice logger."
    }, { filePath, now: new Date("2026-06-10T20:32:00.000Z") });
    await appendDesktopPromptTranscript({
      source: "terminal-pty",
      terminalName: "Codex 1",
      prompt: "Fix the failing test."
    }, { filePath, now: new Date("2026-06-10T20:33:00.000Z") });

    const document = await readFile(filePath, "utf8");
    assert.match(document, /^# Vibyra Prompt Transcripts/);
    assert.match(document, new RegExp(`## Turn ${turn.turnId}`));
    assert.match(document, new RegExp(`## Outcome ${turn.turnId}`));
    assert.match(document, /Session: desktop-chat:chat-1/);
    assert.match(document, /Model: openai\/gpt-5/);
    assert.match(document, /Assistant response \(verbatim\):\n\n    I will open a terminal\./);
    assert.match(document, /Final result \(verbatim\):\n\n    Opening one terminal\./);
    assert.match(document, /"type": "open_terminals"/);
    assert.match(document, /Surface: AI Talk/);
    assert.match(document, /Terminal: Builder/);
    assert.match(document, /Project: SaaS/);
    assert.match(document, /    Build the login page\.\n    Keep the exact V logo\./);
    assert.match(document, /Surface: Terminal Dictation/);
    assert.match(document, /    Run the tests\./);
    assert.match(document, /Surface: Desktop Chat/);
    assert.match(document, /    Review the voice logger\./);
    assert.match(document, /Surface: Native Terminal/);
    assert.match(document, /    Fix the failing test\./);
    assert.doesNotMatch(document, /must-not-be-written/);
    assert.equal(document.match(/# Vibyra Prompt Transcripts/g)?.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
