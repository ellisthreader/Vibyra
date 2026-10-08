import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hero = readFileSync(new URL("./HeroScrollVideo.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const terminalWindow = readFileSync(new URL("./HeroTerminalWindow.jsx", import.meta.url), "utf8");
const terminalData = readFileSync(new URL("./heroTerminalData.js", import.meta.url), "utf8");

test("scroll video imports the motion component it renders", () => {
  assert.match(hero, /import \{ motion, useReducedMotion, useScroll \} from "motion\/react";/);
  assert.match(hero, /<motion\.video/);
});

test("homepage keeps one focused story after the hero", () => {
  assert.match(app, /<Hero \/>\s*<SimpleOverview \/>/);
  assert.doesNotMatch(app, /<ProductFilm \/>/);
});

test("hero terminal tabs switch between realistic Claude and Codex sessions", () => {
  assert.match(terminalWindow, /useState\(HERO_TERMINALS\[0\]\.id\)/);
  assert.match(terminalWindow, /role="tablist"/);
  assert.match(terminalWindow, /aria-selected=\{selected\}/);
  assert.match(terminalData, /Terminal 1 · Claude/);
  assert.match(terminalData, /Terminal 2 · Codex/);
  assert.match(terminalData, /Mobile preview verified/);
});
