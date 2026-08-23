import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("report modal waits for the authenticated API before showing success", async () => {
  const modal = await source("./CommunityReportModal.tsx");
  const submitStart = modal.indexOf("async function submit()");
  const request = modal.indexOf("await reportCommunityProject(", submitStart);
  const success = modal.indexOf("setSent(true)", submitStart);
  const failure = modal.indexOf("setError(submitError instanceof Error", submitStart);

  assert.ok(submitStart >= 0 && request > submitStart);
  assert.ok(success > request);
  assert.ok(failure > success);
  assert.match(modal, /if \(!authToken\)/);
  assert.match(modal, /maxLength=\{1000\}/);
  assert.match(modal, /MAX_SCREENSHOT_DATA_URL_CHARACTERS/);
  assert.doesNotMatch(modal, /onPress=\{\(\) => setSent\(true\)\}/);
});

test("community page passes its account token into every report modal", async () => {
  const page = await source("./CommunityPage.tsx");
  const reportModals = page.match(/<CommunityReportModal authToken=\{authToken\}/g) ?? [];

  assert.equal(reportModals.length, 2);
});

test("authentication legal controls open the canonical Laravel policy routes", async () => {
  const links = await source("../../auth/AuthLegalLinks.tsx");
  const urls = await source("../../../utils/legalLinks.ts");

  assert.match(links, /Linking\.openURL\(LEGAL_URLS\.privacy\)/);
  assert.match(links, /Linking\.openURL\(LEGAL_URLS\.terms\)/);
  assert.match(urls, /https:\/\/vibyra\.app\/legal\/privacy/);
  assert.match(urls, /https:\/\/vibyra\.app\/legal\/terms/);
});
