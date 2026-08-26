import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The palette grew from one row shape to six, spread over three components and
// two stylesheets. Nothing in the build catches a class name that exists in
// only one of those places — the row simply renders unstyled — so the two
// halves are pinned against each other here.

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const COMPONENTS = [
  "src/components/layout/CommandPalette.tsx",
  "src/components/layout/CommandPaletteRow.tsx",
  "src/components/layout/CommandPaletteFooter.tsx",
];
const SHEETS = ["src/styles/palette.css", "src/styles/palette-rows.css"];

/** Every `pal-…` / `pal__…` token in a file, however it was built up. */
function paletteClasses(source) {
  return new Set(source.match(/\bpal(?:-|__)[a-z0-9-]+/g) ?? []);
}

test("every palette class the components render is styled somewhere", async () => {
  const css = (await Promise.all(SHEETS.map(read))).join("\n");
  const styled = paletteClasses(css);
  for (const path of COMPONENTS) {
    for (const name of paletteClasses(await read(path))) {
      assert.ok(styled.has(name), `${path} renders .${name}, which no palette sheet defines`);
    }
  }
});

test("every palette class the sheets define is actually rendered", async () => {
  const rendered = new Set();
  for (const path of COMPONENTS) {
    for (const name of paletteClasses(await read(path))) rendered.add(name);
  }
  for (const path of SHEETS) {
    for (const name of paletteClasses(await read(path))) {
      assert.ok(rendered.has(name), `${path} styles .${name}, which nothing renders any more`);
    }
  }
});

test("both palette sheets are loaded, in the order their ownership assumes", async () => {
  const main = await read("src/main.tsx");
  const shell = main.indexOf('styles/palette.css');
  const rows = main.indexOf('styles/palette-rows.css');
  assert.ok(shell > 0, "palette.css is not imported");
  assert.ok(rows > shell, "palette-rows.css must load after the shell it trims");
});

test("the scopes the footer advertises are the ones the parser accepts", async () => {
  const { PALETTE_SCOPES, parsePaletteQuery } = await import("../src/lib/paletteQuery.ts");
  const footer = await read("src/components/layout/CommandPaletteFooter.tsx");
  assert.match(footer, /PALETTE_SCOPES\.map/, "the footer must render the real scope list");
  for (const { prefix, scope, label } of PALETTE_SCOPES) {
    assert.equal(parsePaletteQuery(`${prefix}anything`).scope, scope);
    assert.ok(label.length > 0, `${prefix} has no label to show`);
  }
});
