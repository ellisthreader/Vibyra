import test from "node:test";
import assert from "node:assert/strict";
import { folderNameSearchScore, normalizeSearchText, projectSearchScore } from "./searchScoring.mjs";

test("folder search scores misspelled names", () => {
  assert.ok(folderNameSearchScore("Vibyra Projects", "vibra") > 0);
  assert.ok(folderNameSearchScore("Client Dashboard", "clinet dashbord") > 0);
  assert.ok(folderNameSearchScore("Marketing Site", "markteing") > 0);
  assert.ok(folderNameSearchScore("Checkout Flow", "chekout") > 0);
});

test("project search ranks exact and prefix matches above fuzzy guesses", () => {
  const exact = { name: "SaaS", path: "/home/ellis/Desktop/SaaS", stack: "React Native" };
  const fuzzy = { name: "Sassafras", path: "/home/ellis/Desktop/Sassafras", stack: "Project" };

  assert.ok(projectSearchScore(exact, "SaaS") > projectSearchScore(fuzzy, "SaaS"));
  assert.ok(projectSearchScore(exact, "saa") > projectSearchScore(fuzzy, "saa"));
});

test("folder search ranks the closest candidate first", () => {
  const folders = ["Client Dashboard", "Client Docs", "Climate Dashboard", "Dashboard Experiments"];
  const ranked = folders
    .map((name) => ({ name, score: folderNameSearchScore(name, "clinet dashbord") }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  assert.equal(ranked[0].name, "Client Dashboard");
  assert.ok(ranked[0].score > ranked[1].score);
});

test("search normalizes case, accents, punctuation, spaces, and hyphens", () => {
  assert.equal(normalizeSearchText("  Café--Client_App  "), "cafe client app");
  assert.equal(folderNameSearchScore("Client Dashboard", "client-dashboard"), 120);
  assert.equal(folderNameSearchScore("ClientDashboard", "client dashboard"), 120);
  assert.equal(folderNameSearchScore("CAFÉ Portal", "cafe"), 100);
});

test("multi-word fuzzy queries must match every query token", () => {
  assert.ok(folderNameSearchScore("Client Dashboard", "clinet dashbord") > 0);
  assert.equal(folderNameSearchScore("Client Dashboard", "clinet payroll"), 0);
});

test("project search can match path and stack without beating name matches", () => {
  const byName = { name: "Mobile App", path: "/home/ellis/Desktop/Work", stack: "Expo" };
  const byPath = { name: "Work", path: "/home/ellis/Desktop/Mobile App", stack: "Project" };
  const byStack = { name: "Frontend", path: "/home/ellis/Desktop/Frontend", stack: "Mobile App" };

  assert.ok(projectSearchScore(byPath, "mobile app") > 0);
  assert.ok(projectSearchScore(byStack, "mobile app") > 0);
  assert.ok(projectSearchScore(byName, "mobile app") > projectSearchScore(byPath, "mobile app"));
  assert.ok(projectSearchScore(byPath, "mobile app") > projectSearchScore(byStack, "mobile app"));
});

test("project search ignores very short fuzzy misses", () => {
  const project = { name: "API", path: "/home/ellis/Desktop/API", stack: "Laravel" };
  assert.equal(projectSearchScore(project, "UI"), 0);
  assert.equal(projectSearchScore(project, "app"), 0);
});

test("folder search rejects unrelated guesses", () => {
  assert.equal(folderNameSearchScore("Settings", "server"), 0);
  assert.equal(folderNameSearchScore("Calendar", "checkout"), 0);
  assert.equal(folderNameSearchScore("API", "app"), 0);
});
