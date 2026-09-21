import assert from "node:assert/strict";
import test from "node:test";

import { chipCopy, NO_PROGRESS } from "../src/lib/updatePolicy.ts";
import {
  shouldAnnounce,
  updateNotice,
  updateReadyNotice,
} from "../src/lib/updateNotices.ts";
import {
  FIRST_CHECK_DELAY_MS,
  MIN_EVENT_GAP_MS,
  POLL_INTERVAL_MS,
  shouldCheck,
} from "../src/lib/updateSchedule.ts";
import { DEFAULT_CATEGORIES } from "../src/lib/notificationPrefs.ts";
import { enqueue } from "../src/state/notificationQueue.ts";
import { shouldEscalate, createOsGate } from "../src/lib/notificationPolicy.ts";

const progress = (received, total, percent) => ({ received, total, percent });

// --- Noticing a release live -------------------------------------------------

test("waking, reconnecting and refocusing each check immediately", () => {
  // The whole point of the wake triggers: a laptop shut over a weekend must
  // find the release on the way up, not one poll interval later.
  for (const trigger of ["wake", "online"]) {
    assert.equal(shouldCheck(trigger, 0, 1_000), true, `${trigger} before any check`);
    assert.equal(shouldCheck(trigger, 1_000, 1_000 + MIN_EVENT_GAP_MS), true);
  }
});

test("a lid opening on a new network is one check, not a burst", () => {
  // focus, visibilitychange and online all fire together; only the first may
  // reach the feed, or a Wi-Fi switch becomes a small flood.
  const now = 500_000;
  assert.equal(shouldCheck("wake", now, now), false);
  assert.equal(shouldCheck("online", now, now + 5_000), false);
  assert.equal(shouldCheck("wake", now, now + MIN_EVENT_GAP_MS - 1), false);
});

test("the scheduled checks are never throttled away", () => {
  // `start` and `interval` are the floor. If the event gap could suppress them
  // the app would go quiet for as long as the user kept touching the window.
  assert.equal(shouldCheck("start", Date.now(), Date.now()), true);
  assert.equal(shouldCheck("interval", Date.now(), Date.now()), true);
});

test("polling is frequent enough to be live but inside the feed's throttle", () => {
  // The backend allows 60 requests a minute; five minutes leaves vast headroom
  // while still finding a release within minutes of publication.
  assert.ok(POLL_INTERVAL_MS <= 5 * 60 * 1000, "a release must land within minutes");
  assert.ok(POLL_INTERVAL_MS >= 60_000, "sub-minute polling is not worth the wakeups");
  assert.ok(FIRST_CHECK_DELAY_MS < POLL_INTERVAL_MS);
});

// --- Telling the user --------------------------------------------------------

test("a release is announced once, not on every poll", () => {
  // The feed keeps returning the same release until the user restarts, so
  // without this the toast would reappear every interval, forever.
  assert.equal(shouldAnnounce("", "0.7.6"), true);
  assert.equal(shouldAnnounce("0.7.6", "0.7.6"), false);
  assert.equal(shouldAnnounce("0.7.6", "0.7.7"), true, "a newer release is news again");
  assert.equal(shouldAnnounce("", ""), false, "no version is not an announcement");
});

test("the update notice can actually reach the desktop", () => {
  // `shouldEscalate` refuses severity "info", and only a category configured
  // for the "system" channel escalates. Getting either wrong would leave the
  // notification in-app only — silently defeating the whole feature.
  const notice = updateNotice("0.7.6");
  assert.notEqual(notice.severity, "info");
  assert.equal(DEFAULT_CATEGORIES.appUpdate.channel, "system");
  assert.notEqual(notice.osEligible, false);

  const prefs = { enabled: true, osEnabled: true, osOnlyWhenAway: true, categories: DEFAULT_CATEGORIES };
  const item = { ...notice, id: 1, at: 0, count: 1, read: false };
  assert.equal(
    shouldEscalate(prefs, item, { focused: false, isRepeat: false, now: 0 }, createOsGate()),
    true,
  );
});

test("the update notice is sticky and carries the one-click action", () => {
  const notice = updateNotice("0.7.6");
  assert.equal(notice.timeoutMs, 0, "an update the user blinked past is the original bug");
  assert.equal(notice.action.id, "installUpdate");
  assert.match(notice.title, /0\.7\.6/);

  // Same release twice must collapse rather than stack a second toast.
  assert.equal(updateNotice("0.7.6").dedupeKey, notice.dedupeKey);
  assert.notEqual(updateNotice("0.7.7").dedupeKey, notice.dedupeKey);
  // "available" and "ready" are different events about the same version and
  // must not coalesce onto each other.
  assert.notEqual(updateReadyNotice("0.7.6").dedupeKey, notice.dedupeKey);
});

test("a long release note falls back rather than overflowing the toast", () => {
  const short = updateNotice("0.7.6", "Faster terminals.");
  assert.equal(short.body, "Faster terminals.");

  const long = updateNotice("0.7.6", "x".repeat(400));
  assert.match(long.body, /Click Update/);
});

// --- The title-bar chip ------------------------------------------------------

test("the chip is absent only when there is genuinely no update", () => {
  assert.equal(chipCopy("idle", "", NO_PROGRESS, null), null);
  assert.equal(chipCopy("available", "", NO_PROGRESS, null), null);
  assert.ok(chipCopy("available", "0.7.6", NO_PROGRESS, null));
});

test("the chip survives dismissing the banner", () => {
  // `chipCopy` takes no `dismissed` argument by design. If waving the banner
  // away also emptied the title bar there would be no route back to the update
  // short of relaunching — exactly the dead end this chip exists to close.
  assert.equal(chipCopy.length, 4);
});

test("the chip only offers a restart once the package is staged", () => {
  // A restart offered mid-download would kill live terminals for nothing.
  assert.equal(chipCopy("available", "0.7.6", NO_PROGRESS, null).glyph, "download");
  assert.equal(chipCopy("downloading", "0.7.6", progress(1, 2, 50), null).glyph, "download");
  assert.equal(chipCopy("error", "0.7.6", NO_PROGRESS, "boom").glyph, "download");
  assert.equal(chipCopy("ready", "0.7.6", NO_PROGRESS, null).glyph, "restart");
});

test("the chip reports progress and refuses clicks while downloading", () => {
  const busy = chipCopy("downloading", "0.7.6", progress(512, 1024, 50), null);
  assert.equal(busy.label, "50%");
  assert.equal(busy.busy, true);

  // A response without a content length must not render a fake percentage.
  const unknown = chipCopy("downloading", "0.7.6", NO_PROGRESS, null);
  assert.equal(unknown.label, "…");

  for (const status of ["available", "ready", "error"]) {
    assert.equal(chipCopy(status, "0.7.6", NO_PROGRESS, "boom").busy, false);
  }
});

test("a failed download keeps the chip and says what went wrong", () => {
  const failed = chipCopy("error", "0.7.6", NO_PROGRESS, "network unreachable");
  assert.equal(failed.label, "Retry");
  assert.equal(failed.title, "network unreachable");
});

test("the ready notice never collapses into a count", () => {
  // A fast download puts "available" and "ready" inside the burst window. If
  // they collapse, the notification centre says "2 Vibyra updates" — losing the
  // one that tells the user to restart — and the collapse counts as a repeat,
  // so it never reaches the desktop either. Caught running the real flow.
  const now = 1_000;
  const first = enqueue({ history: [], visible: [] }, updateNotice("0.7.6"), 1, now);
  const second = enqueue(first, updateReadyNotice("0.7.6"), 2, now + 200);

  assert.equal(second.isRepeat, false, "the ready notice must escalate on its own");
  assert.equal(second.history.length, 2);
  assert.match(second.item.title, /ready/);
  assert.equal(second.item.action.label, "Restart now");
});

test("other categories still summarise a genuine burst", () => {
  // The rule above is scoped: N agents failing in a blink is still one sentence
  // with a count, which is the reason bursting exists at all.
  const now = 1_000;
  const fail = (id) => ({ category: "agentFailed", severity: "danger", title: `run ${id} failed` });
  const first = enqueue({ history: [], visible: [] }, fail(1), 1, now);
  const second = enqueue(first, fail(2), 2, now + 200);

  assert.equal(second.isRepeat, true);
  assert.equal(second.item.title, "2 agents failed");
});
