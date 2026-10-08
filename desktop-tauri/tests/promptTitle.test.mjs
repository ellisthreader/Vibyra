import assert from "node:assert/strict";
import test from "node:test";

import { cleanNativeTitle, nextAutoTitle, titleFromPrompt } from "../src/lib/promptTitle.ts";

test("a plain request becomes its own title", () => {
  assert.equal(titleFromPrompt("redesign the website hero"), "Redesign the website hero");
  assert.equal(titleFromPrompt("fix the login bug"), "Fix the login bug");
});

test("politeness and preamble are dropped", () => {
  assert.equal(titleFromPrompt("Hey, can you please fix the login bug?"), "Fix the login bug");
  assert.equal(titleFromPrompt("I want you to redesign the pricing page"), "Redesign the pricing page");
  assert.equal(titleFromPrompt("Could you help me to add dark mode to settings thanks"), "Add dark mode to settings");
  assert.equal(titleFromPrompt("ok so now let's refactor the auth store"), "Refactor the auth store");
});

test("a greeting to the agent is dropped with its name", () => {
  assert.equal(titleFromPrompt("hey claude, could you please fix the failing tests in mobile"), "Fix the failing tests in mobile");
  assert.equal(titleFromPrompt("Codex: add a retry to the upload"), "Add a retry to the upload");
});

test("only the first sentence says what the request is", () => {
  assert.equal(
    titleFromPrompt("Add a Stripe checkout button. It should open in a new tab and track the click."),
    "Add a Stripe checkout button",
  );
});

test("a long request is cut at a word, never on a dangling one", () => {
  const title = titleFromPrompt("redesign the entire marketing website front end so that it feels modern and fast");
  assert.equal(title, "Redesign the entire marketing website front");
  assert.ok(title.length <= 44);
  assert.equal(
    titleFromPrompt("write the migration for the users table and then update all of the tests"),
    "Write the migration for the users table",
  );
  assert.equal(titleFromPrompt("explain how the terminal registry works in this app and why"), "Explain how the terminal registry works");
});

test("links, markdown and code fences do not become the title", () => {
  assert.equal(titleFromPrompt("https://github.com/acme/app/issues/12 fix this crash on launch"), "Fix this crash on launch");
  assert.equal(titleFromPrompt("**Fix** the `useEffect` loop in `Sidebar.tsx`"), "Fix the useEffect loop in Sidebar.tsx");
});

test("input with no words is not a title", () => {
  assert.equal(titleFromPrompt(""), null);
  assert.equal(titleFromPrompt(null), null);
  assert.equal(titleFromPrompt("   ...  "), null);
  assert.equal(titleFromPrompt("12345 67890"), null);
  assert.equal(titleFromPrompt("please"), null);
  assert.equal(titleFromPrompt("yes"), null);
});

test("non-latin requests still get a title", () => {
  assert.equal(titleFromPrompt("修复登录页面的错误"), "修复登录页面的错误");
});

test("an agent's own title is cleaned to one short line", () => {
  assert.equal(cleanNativeTitle('  "Website redesign"\n'), "Website redesign");
  assert.equal(cleanNativeTitle("Fix   the\nlogin bug"), "Fix the login bug");
  assert.equal(cleanNativeTitle("…"), null);
  assert.equal(cleanNativeTitle(null), null);
  assert.ok(cleanNativeTitle("x".repeat(200)).length <= 80);
});

test("the agent's name beats the first request, which is never replaced by a later one", () => {
  const hint = (prompt, nativeTitle) => ({ prompt, nativeTitle });
  assert.equal(nextAutoTitle(null, hint("redesign the website hero", null)), "Redesign the website hero");
  assert.equal(nextAutoTitle("Redesign the website hero", hint("something else entirely now", null)), "Redesign the website hero");
  assert.equal(nextAutoTitle("Redesign the website hero", hint("x", "Website hero redesign")), "Website hero redesign");
  assert.equal(nextAutoTitle("Website hero redesign", hint(null, null)), "Website hero redesign");
  assert.equal(nextAutoTitle(null, hint(null, null)), null);
});

test("a spoken request is cut where it turns from what to how", () => {
  assert.equal(
    titleFromPrompt("Go through the whole vibyra mac software please I want you to run a performance audit"),
    "Vibyra mac software",
  );
  assert.equal(titleFromPrompt("Go through the relay local host please when a user signs up it breaks"), "Relay local host");
  assert.equal(titleFromPrompt("fix the hero, it overlaps the nav on phones"), "Fix the hero");
  assert.equal(titleFromPrompt("doesnt work when I use that command"), "Doesnt work when I use that command");
});

test("asking to look at something is titled by the thing", () => {
  assert.equal(titleFromPrompt("review this hero section"), "Hero section");
  assert.equal(titleFromPrompt("review Browse by topic on http://127.0.0.1:8000/support it isnt loading"), "Browse by topic");
  assert.equal(titleFromPrompt("Can you analyse the whole live preview system"), "Live preview system");
  assert.equal(titleFromPrompt("review the code"), "Review the code");
});

test("an agent's slug title reads like the others", () => {
  assert.equal(cleanNativeTitle("preview-device-overhaul"), "Preview device overhaul");
  assert.equal(cleanNativeTitle("cli view navigation"), "Cli view navigation");
  assert.equal(cleanNativeTitle("iOS chat fixes"), "iOS chat fixes");
  assert.equal(cleanNativeTitle("Sign-in page redesign"), "Sign-in page redesign");
});
