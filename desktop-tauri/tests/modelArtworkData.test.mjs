import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

import {
  modelArtworkFile,
  nativeAccountModelSupported,
} from "../src/lib/modelArtworkData.ts";

test("keeps Fable 5.1 artwork distinct from Fable 5", async () => {
  const fable51 = modelArtworkFile(
    "anthropic/claude-fable-5-1",
    "Claude Fable 5.1",
  );

  assert.equal(fable51, "claude-fable-5.1.png");
  assert.equal(
    modelArtworkFile("anthropic/claude-fable-5", "Claude Fable 5"),
    "claude-fable-5.png",
  );
  assert.equal(
    nativeAccountModelSupported("Anthropic", "anthropic/claude-fable-5-1"),
    true,
  );
  await access(new URL(`../src/assets/model-icons/${fable51}`, import.meta.url));
});
