import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fixtureReport } from "./ownerFixtures.mjs";

test("every report section renders normal, empty, missing and sparse records", async t => {
  const warnings = t.mock.method(console, "error", () => {});
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: { port: 24679 } }, appType: "custom" });
  try {
    const load = name => server.ssrLoadModule("/resources/js/portal/owner/" + name + ".jsx");
    const names = ["OwnerOverview", "OwnerDownloads", "OwnerMemberships", "OwnerWebsite", "OwnerUsage", "OwnerTracking"];
    const modules = await Promise.all(names.map(load));
    let renders = 0;
    for (const scenario of ["normal", "empty", "unavailable", "sparse", "stale"]) {
      const data = fixtureReport(30, scenario);
      for (let i = 0; i < names.length; i++) {
        const tabs = names[i] === "OwnerWebsite" ? ["traffic", "sources", "journeys", "experience"]
          : names[i] === "OwnerUsage" ? ["desktop", "mobile", "cloud"] : [undefined];
        for (const tab of tabs) {
          const markup = renderToStaticMarkup(React.createElement(modules[i].default, { data, tab, navigate() {} }));
          assert.doesNotMatch(markup, /NaN|undefined|Infinity/, `${names[i]} / ${tab} / ${scenario}`);
          assert.match(markup, /<section|od-metric/);
          if (names[i] === "OwnerOverview" && scenario === "normal") {
            assert.match(markup, /Website checkouts/);
            assert.match(markup, /Recorded completions/);
            assert.match(markup, /Current total/);
          }
          if (names[i] === "OwnerDownloads" && scenario === "unavailable") {
            assert.match(markup, /Data unavailable/);
            assert.match(markup, /No daily records available/);
          }
          renders++;
        }
      }
    }
    assert.equal(renders, 55);
    assert.equal(warnings.mock.calls.length, 0, "React must render without warnings");
  } finally { await server.close(); }
});
