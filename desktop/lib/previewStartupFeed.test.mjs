import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPreviewStartup,
  beginPreviewStartup,
  finishPreviewStartup,
  previewStartupFeed
} from "./previewStartupFeed.mjs";

test("preview startup feed exposes the approved command and real process output", () => {
  beginPreviewStartup("feed-project", {
    id: "target",
    command: "npm run dev -- --host 0.0.0.0",
    framework: "Vite"
  });
  appendPreviewStartup("feed-project", "target", "VITE ready in 420 ms\n");
  finishPreviewStartup("feed-project", "target", "live", "Preview is live.");

  const feed = previewStartupFeed("feed-project", "target");
  assert.equal(feed.state, "live");
  assert.match(feed.output, /^\$ npm run dev/);
  assert.match(feed.output, /VITE ready in 420 ms/);
  assert.match(feed.output, /Preview is live/);
});

test("preview startup feeds remain isolated by target", () => {
  beginPreviewStartup("multi-feed-project", { id: "frontend", command: "npm run dev", framework: "Vite" });
  beginPreviewStartup("multi-feed-project", { id: "backend", command: "php artisan serve", framework: "Laravel" });
  appendPreviewStartup("multi-feed-project", "frontend", "frontend ready\n");
  appendPreviewStartup("multi-feed-project", "backend", "backend ready\n");

  assert.match(previewStartupFeed("multi-feed-project", "frontend").output, /frontend ready/);
  assert.doesNotMatch(previewStartupFeed("multi-feed-project", "frontend").output, /backend ready/);
  assert.match(previewStartupFeed("multi-feed-project", "backend").output, /backend ready/);
});
