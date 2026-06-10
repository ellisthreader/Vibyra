import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ownedPreviewSources = [
  new URL("../screens/workspace/hooks/workspaceChatRuntime.ts", import.meta.url),
  new URL("./previewUrls.ts", import.meta.url),
  new URL("../screens/workspace/helpers/chatPrompts.ts", import.meta.url),
  new URL("../screens/workspace/inline/chunk3.tsx", import.meta.url),
  new URL("../screens/workspace/inline/index.ts", import.meta.url)
];

test("mobile preview sources never construct preview URLs from connection.token", async () => {
  const sources = await Promise.all(ownedPreviewSources.map((url) => readFile(url, "utf8")));
  const combined = sources.join("\n");

  assert.doesNotMatch(combined, /projectPreviewUrl/);
  assert.doesNotMatch(combined, /connection\.token/);
  assert.doesNotMatch(combined, /preview\/(?:project|server|proxy-url)[^`\n]*\$\{[^}]*token/i);
});

test("workspace preview runtime requests a scoped URL from the desktop endpoint", async () => {
  const source = await readFile(ownedPreviewSources[0], "utf8");

  assert.match(source, /app\.startPreviewServer\(projectId,\s*projectName\)/);
  assert.doesNotMatch(source, /\/preview\/project\//);
});
