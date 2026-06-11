import test from "node:test";
import assert from "node:assert/strict";
import {
  renderProviderPixelLogo,
  renderRgbaPixelLogo
} from "./aiTerminalProviderPixelLogo.mjs";

test("renders RGBA pairs with true-color foreground and background", () => {
  const logo = {
    width: 2,
    height: 2,
    rgba: [
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 0, 0, 0, 0, 255, 255
    ]
  };

  const [line] = renderRgbaPixelLogo(logo, true, { maxWidth: 2 });
  assert.match(line, /^\x1b\[38;2;255;0;0m▀\x1b\[0m/);
  assert.match(line, /\x1b\[38;2;0;255;0m\x1b\[48;2;0;0;255m▀\x1b\[0m$/);
});

test("no-color rendering preserves transparent pixel geometry", () => {
  const logo = {
    width: 3,
    height: 2,
    rgba: [
      1, 2, 3, 255, 0, 0, 0, 0, 7, 8, 9, 255,
      4, 5, 6, 255, 4, 5, 6, 255, 0, 0, 0, 0
    ]
  };

  const rendered = renderRgbaPixelLogo(logo, false, { maxWidth: 3 });
  assert.deepEqual(rendered, ["█▄▀"]);
  assert.equal(rendered[0].includes("\x1b["), false);
});

test("maxWidth scales proportionally and output is hard bounded", () => {
  const logo = solidLogo(400, 400);
  const narrow = renderRgbaPixelLogo(logo, false, { maxWidth: 7 });
  const capped = renderRgbaPixelLogo(solidLogo(400, 100), false, { maxWidth: 10_000 });

  assert.equal(narrow.length, 4);
  assert.ok(narrow.every((line) => [...line].length === 7));
  assert.equal(capped.length, 12);
  assert.ok(capped.every((line) => [...line].length === 96));
});

test("provider lookup consumes the generated-data shape", () => {
  const logos = {
    deepseek: {
      width: 1,
      height: 2,
      rgba: [12, 34, 56, 255, 12, 34, 56, 255]
    }
  };

  assert.deepEqual(
    renderProviderPixelLogo("deepseek", { color: false, logos, maxWidth: 1 }),
    ["█"]
  );
});

test("unknown and malformed providers use deterministic bounded fallbacks", () => {
  const logos = { broken: { width: 2, height: 2, rgba: [1, 2] } };
  const first = renderProviderPixelLogo("missing", {
    color: false, logos, maxWidth: 6, fallbackLabel: "Acme Labs"
  });
  const second = renderProviderPixelLogo("missing", {
    color: false, logos, maxWidth: 6, fallbackLabel: "Acme Labs"
  });
  const other = renderProviderPixelLogo("missing", {
    color: false, logos, maxWidth: 6, fallbackLabel: "Other Labs"
  });
  const malformed = renderProviderPixelLogo("broken", {
    color: false, logos, maxWidth: 6, fallbackLabel: "Broken"
  });

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
  assert.ok(first.length <= 14);
  assert.ok(first.every((line) => [...line].length <= 6));
  assert.ok(malformed.length > 0);
});

test("public renderer defaults to color and a large bounded presentation", () => {
  const logos = { wide: solidLogo(80, 32) };
  const rendered = renderProviderPixelLogo("wide", { logos });

  assert.equal(rendered.length, 12);
  assert.ok(rendered.every((line) => stripAnsi(line).length === 60));
  assert.match(rendered[0], /^\x1b\[38;2;/);
});

test("checked-in compressed provider assets decode into a substantial logo", () => {
  const rendered = renderProviderPixelLogo("deepseek", { color: false, maxWidth: 70 });

  assert.ok(rendered.length >= 18);
  assert.ok(rendered.some((line) => /[█▀▄]/.test(line)));
  assert.ok(rendered.every((line) => [...line].length <= 70));
});

function solidLogo(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba.set([20, 40, 60, 255], offset);
  }
  return { width, height, rgba };
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}
