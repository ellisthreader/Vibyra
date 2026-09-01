import assert from "node:assert/strict";
import test from "node:test";

import { reduceAll } from "../src/lib/agentEventReducer.ts";
import {
  decisionNotice,
  routineFailureNotice,
} from "../src/lib/agentWorkNoticePolicy.ts";
import { lastRunLine, runStrip, STRIP_LENGTH } from "../src/lib/routineRunStrip.ts";

const run = (id, status, extra = {}) => ({
  id,
  routineId: "digest",
  chatId: null,
  scheduledMs: 1_000,
  startedMs: 1_000,
  endedMs: 2_000,
  status,
  error: null,
  ...extra,
});

// ── the strip ────────────────────────────────────────────────────────────

test("skip, fail and running are three distinguishable marks", () => {
  // Amber is a skip — a fact about the laptop being shut, not a failure. Red
  // is a real failure. Cobalt is happening now. The row needs all three to be
  // separable without a legend.
  const marks = runStrip([
    run("r3", "running"),
    run("r2", "failed", { error: "codex exited 1 — not signed in" }),
    run("r1", "skipped"),
  ]);
  assert.deepEqual(
    marks.map((mark) => mark.status),
    ["skipped", "failed", "running"],
    "oldest first: a strip is read left to right as time passing",
  );
  assert.match(marks[1].title, /codex exited 1/, "a failure's reason reaches the mark");
  assert.match(marks[0].title, /Vibyra was closed/);
});

test("the strip is capped, and keeps the newest", () => {
  const many = Array.from({ length: 30 }, (_, index) => run(`r${index}`, "completed"));
  many[0] = run("newest", "failed", { error: "boom" });
  const marks = runStrip(many);
  assert.equal(marks.length, STRIP_LENGTH);
  assert.equal(marks.at(-1).id, "newest", "the most recent outcome sits at the right-hand end");
});

test("a routine nobody has seen work shows an empty strip", () => {
  assert.deepEqual(runStrip([]), []);
  assert.equal(lastRunLine(undefined), "");
});

test("the last run is a sentence, because failed and skipped need a reason", () => {
  assert.equal(lastRunLine(run("a", "failed", { error: "not signed in" })), "Last run failed: not signed in");
  assert.equal(lastRunLine(run("a", "skipped")), "Last run skipped — Vibyra was closed.");
  assert.equal(lastRunLine(run("a", "running")), "Running now");
});

// ── silence on success ───────────────────────────────────────────────────

test("a completed run says nothing and a failed one says exactly one thing", () => {
  // The fastest way to make this whole system invisible is to make it chatty
  // at 09:00 every morning.
  const routines = [{ id: "digest", name: "Morning digest" }];
  assert.equal(routineFailureNotice("digest", [run("a", "completed")], routines), null);
  assert.equal(routineFailureNotice("digest", [run("a", "skipped")], routines), null);
  assert.equal(routineFailureNotice("digest", [], routines), null);

  const notice = routineFailureNotice(
    "digest",
    [run("a", "failed", { error: "not signed in", chatId: "c1" })],
    routines,
  );
  assert.equal(notice.kind, "agent");
  assert.equal(notice.tier, "fail");
  assert.match(notice.title, /Morning digest/);
  assert.equal(notice.body, "not signed in");
  // Keyed by the run, so a refetch of the same failure is one notice.
  assert.equal(notice.dedupeKey, "agent:routine-failed:a");
  assert.deepEqual(notice.action, { id: "openAgentChat", label: "Open chat", arg: "c1" });
});

test("only the newest run is reported — an older failure was already said", () => {
  const runs = [run("new", "completed"), run("old", "failed", { error: "boom" })];
  assert.equal(routineFailureNotice("digest", runs, []), null);
});

// ── decisions ────────────────────────────────────────────────────────────

test("a waiting decision says what has not happened yet", () => {
  assert.equal(decisionNotice([]), null);

  const notice = decisionNotice([
    { agentName: "Scout", target: "#standup", action: "post" },
    { agentName: "Quill", target: "LICENSE", action: "write" },
  ]);
  assert.equal(notice.kind, "approval");
  assert.equal(notice.tier, "ask");
  assert.match(notice.title, /Scout/);
  assert.match(notice.body, /nothing has been done yet/);
  assert.match(notice.body, /1 more waiting/);
  // One key for the queue: three cards in a minute is one interruption.
  assert.equal(notice.dedupeKey, "agent:decisions-waiting");
  assert.equal(notice.action.id, "openDecisions");
});

// ── the applied skill ────────────────────────────────────────────────────

test("skills that applied fold into one block per turn", () => {
  const row = (kind, extra, seq) => ({
    chatId: "c1",
    turnId: "t1",
    seq,
    createdMs: 1_000,
    kind,
    ...extra,
  });
  const state = reduceAll([
    row("turn.started", { prompt: "write the changelog" }, 0),
    row("skill.applied", { skillId: "s1", name: "Changelog entries", version: 3 }, 1),
    row("skill.applied", { skillId: "s2", name: "PR triage", version: 2 }, 2),
    // A replayed duplicate must not double the list.
    row("skill.applied", { skillId: "s1", name: "Changelog entries", version: 3 }, 3),
  ]);
  const skills = state.blocks.filter((block) => block.type === "skills");
  assert.equal(skills.length, 1, "three skills that matched are one line naming three");
  assert.deepEqual(
    skills[0].applied.map((entry) => `${entry.name} v${entry.version}`),
    ["Changelog entries v3", "PR triage v2"],
  );
});

test("a turn where nothing matched renders nothing at all", () => {
  // An empty state here would be noise on the majority of turns.
  const state = reduceAll([
    { chatId: "c1", turnId: "t1", seq: 0, createdMs: 1, kind: "turn.started", prompt: "hello" },
  ]);
  assert.equal(state.blocks.some((block) => block.type === "skills"), false);
});
