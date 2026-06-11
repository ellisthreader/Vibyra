import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(
  new URL("./app.profile-billing-plans.css", import.meta.url),
  "utf8"
);
const artwork = readFileSync(
  new URL("./app.profile-billing-plan-art.css", import.meta.url),
  "utf8"
);

test("the current billing plan keeps the same card surface as every other plan", () => {
  assert.match(
    styles,
    /\.profile-plan-card\.is-current\s*{\s*background:\s*var\(--surface-bg-elevated/
  );
  assert.doesNotMatch(
    styles,
    /\.profile-plan-card\.is-current\s*{\s*background:\s*var\(--surface-hover/
  );
  assert.match(
    artwork,
    /\.profile-plan-card\.is-current::after[\s\S]*var\(--surface-bg-elevated/
  );
});

test("current plan status stays aligned without turning the whole card gray", () => {
  assert.match(
    styles,
    /\.profile-plan-current\s*{[\s\S]*border-top:\s*1px solid var\(--surface-line-soft/
  );
  assert.match(styles, /\.profile-plan-current\s*{[\s\S]*justify-content:\s*center/);
});
