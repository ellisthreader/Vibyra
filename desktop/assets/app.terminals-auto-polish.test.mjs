import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(
  new URL("./app.terminals-auto-polish.css", import.meta.url),
  "utf8"
);

test("Auto polish stays scoped to the waiting provider", () => {
  const selectorLines = styles
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(".") && line.endsWith("{"));

  assert.ok(selectorLines.length >= 4);
  for (const selector of selectorLines) {
    assert.match(
      selector,
      /\.terminal-provider-auto\.terminal-auto-waiting\b/,
      selector
    );
  }
  assert.doesNotMatch(
    styles,
    /(^|,)\s*\.terminal-provider-auto(?!\.terminal-auto-waiting)/m
  );
  assert.doesNotMatch(styles, /\.terminal-provider-(?:openai|claude|gemini)\b/);
});

test("the terminal-rendered text V remains the only logo", () => {
  assert.doesNotMatch(styles, /\.terminal-pty-lines::(?:before|after)/);
  assert.doesNotMatch(styles, /content:\s*["']V["']/);
  assert.doesNotMatch(styles, /watermark|orbit|vibyra-auto-mark/);
});

test("motion has a complete reduced-motion fallback", () => {
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important;/
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none !important;/
  );
});

test("polish does not alter PTY or xterm geometry", () => {
  assert.doesNotMatch(styles, /\.terminal-xterm\b|\.xterm(?:-screen|-viewport)?\b/);
  assert.doesNotMatch(styles, /grid-template|padding|margin|overflow|contain\s*:/);
  assert.doesNotMatch(styles, /display\s*:|position:\s*(?:fixed|sticky)/);
});
