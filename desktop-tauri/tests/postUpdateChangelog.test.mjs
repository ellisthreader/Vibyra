import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  POST_UPDATE_CHANGELOG_STORAGE_KEY,
  markPostUpdateChangelogPending,
  readPostUpdateChangelogReceipt,
  rememberPostUpdateChangelog,
  shouldShowPostUpdateChangelog,
} from "../src/lib/postUpdateChangelogPolicy.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

test("only the exact installed update becomes eligible", () => {
  const storage = new MemoryStorage();
  assert.equal(shouldShowPostUpdateChangelog("8.0.0", storage), false);
  assert.equal(markPostUpdateChangelogPending("8.1.0", storage), true);
  assert.equal(shouldShowPostUpdateChangelog("8.0.0", storage), false);
  assert.equal(shouldShowPostUpdateChangelog("8.1.0", storage), true);
  assert.deepEqual(readPostUpdateChangelogReceipt(storage), {
    pendingVersion: "8.1.0",
    seenVersion: null,
  });
});

test("dismissal clears pending state and survives another launch", () => {
  const storage = new MemoryStorage();
  markPostUpdateChangelogPending("8.2.0", storage);
  assert.equal(rememberPostUpdateChangelog("8.2.0", storage), true);
  assert.equal(shouldShowPostUpdateChangelog("8.2.0", storage), false);
  assert.deepEqual(JSON.parse(storage.getItem(POST_UPDATE_CHANGELOG_STORAGE_KEY)), {
    pendingVersion: null,
    seenVersion: "8.2.0",
  });
});

test("the first content release bridges binaries that could not mark pending", () => {
  const storage = new MemoryStorage();
  assert.equal(shouldShowPostUpdateChangelog("8.2.5", storage), false);
  assert.equal(shouldShowPostUpdateChangelog("8.2.5", storage, true), true);
  rememberPostUpdateChangelog("8.2.5", storage);
  assert.equal(shouldShowPostUpdateChangelog("8.2.5", storage, true), false);
});

test("malformed or unavailable storage never blocks updating", () => {
  const malformed = new MemoryStorage();
  malformed.setItem(POST_UPDATE_CHANGELOG_STORAGE_KEY, "not-json");
  assert.deepEqual(readPostUpdateChangelogReceipt(malformed), {
    pendingVersion: null,
    seenVersion: null,
  });
  assert.equal(markPostUpdateChangelogPending("8.3.0", malformed), true);
  const unavailable = {
    getItem() { throw new Error("unavailable"); },
    setItem() { throw new Error("unavailable"); },
  };
  assert.equal(markPostUpdateChangelogPending("8.4.0", unavailable), false);
  assert.equal(shouldShowPostUpdateChangelog("8.4.0", unavailable), false);
});

test("the updater records pending notes after saving and before install", async () => {
  const store = await read("../src/state/updateStore.ts");
  const save = store.indexOf("await saveSessionNow(true)");
  const pending = store.indexOf("markPostUpdateChangelogPending(update.version)");
  const install = store.indexOf("await installUpdate(update)");
  assert.ok(save >= 0 && save < pending && pending < install);
  assert.match(store, /installAtStartup: \(\) => install\(false\)/);
});

test("the modal is deferred until after the updater gate", async () => {
  const app = await read("../src/App.tsx");
  const deferred = await read("../src/components/changelog/DeferredPostUpdateChangelog.tsx");
  const hook = await read("../src/components/changelog/usePostUpdateChangelog.ts");
  assert.ok(app.indexOf("if (!startup.complete)") < app.indexOf("<DeferredPostUpdateChangelog"));
  assert.match(deferred, /import\("\.\/PostUpdateChangelog"\)/);
  assert.match(deferred, /\.catch\(\(error\)/);
  assert.match(hook, /import\.meta\.env\.DEV && !preview/);
  assert.match(hook, /\.auth__viewport, \.app > \.shell/);
  assert.match(hook, /!document\.querySelector\("\.first-welcome"\)/);
});

test("the approved visual, interaction and accessibility contract is present", async () => {
  const component = await read("../src/components/changelog/PostUpdateChangelog.tsx");
  const focus = await read("../src/lib/useModalFocus.ts");
  const shell = await read("../src/styles/post-update-changelog.css");
  const content = await read("../src/styles/post-update-changelog-content.css");
  const responsive = await read("../src/styles/post-update-changelog-responsive.css");
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /data-autofocus/);
  assert.match(component, /event\.target === event\.currentTarget/);
  assert.match(component, /You’re up to date/);
  assert.match(focus, /active === first \|\| outside \|\| staticFocus/);
  assert.match(shell, /width: min\(560px/);
  assert.match(shell, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(shell, /backdrop-filter: blur\(3px\)/);
  assert.match(content, /background: var\(--action\)/);
  assert.match(responsive, /max-height: 650px/);
  assert.match(responsive, /prefers-reduced-motion: reduce/);
});

test("0.3.0 content and its optimized local artwork ship together", async () => {
  const content = await read("../src/components/changelog/changelogContent.ts");
  const hero = await stat(new URL(
    "../src/assets/changelog/vibyra-release-0.3.0.webp",
    import.meta.url,
  ));
  assert.match(content, /"0\.3\.0"/);
  assert.match(content, /allowUnmarkedLaunch: true/);
  assert.match(content, /Updates finish before your workspace opens/);
  assert.match(content, /Projects show their recent story/);
  assert.match(content, /Terminal prompts keep their focus/);
  assert.ok(hero.size > 0 && hero.size < 100_000, `hero is ${hero.size} bytes`);
});
