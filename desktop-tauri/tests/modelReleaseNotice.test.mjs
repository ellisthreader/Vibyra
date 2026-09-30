import assert from "node:assert/strict";
import test from "node:test";

import { CATEGORY_DESCRIPTORS } from "../src/components/settings/notificationCategories.ts";
import { modelReleaseNotice } from "../src/lib/modelReleaseNotice.ts";

test("release notice describes any OpenRouter model without promising launch support", () => {
  const notice = modelReleaseNotice({ id: "provider/image-model", name: "Image Model" });
  assert.equal(notice.body, "Image Model · provider/image-model");
  assert.equal(notice.dedupeKey, "model:provider/image-model");
  assert.equal(notice.action, undefined);
  assert.match(
    CATEGORY_DESCRIPTORS.find((category) => category.id === "models")?.hint ?? "",
    /Availability in Vibyra varies/,
  );
});
