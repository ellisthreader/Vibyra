import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, "../../..");
const read = (path) => readFileSync(join(backend, path), "utf8");

function filesUnder(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = join(path, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

test("portal account sessions and public download routes retain their boundaries", () => {
  const api = read("resources/js/portal/api.js");
  const routes = read("routes/web.php");
  assert.match(api, /\/web-api\/session/);
  assert.match(api, /credentials: "same-origin"/);
  assert.match(api, /X-CSRF-TOKEN/);
  assert.match(api, /`\/downloads\/\$\{encodeURIComponent\(platform\)\}`/);
  assert.match(routes, /Route::view\('\/downloads', 'downloads'\)/);
  assert.match(routes, /Route::view\('\/account\/downloads', 'downloads'\)/);
  assert.match(routes, /Route::get\('\/web-api\/releases'/);
  assert.match(routes, /\['windows', 'linux', 'linux-deb', 'macos-arm64', 'macos-x64'\]/);
});

test("macOS recommendation excludes iPhone and iPad browsers", async () => {
  const { recommendedPlatform } = await import("./platform.js");
  assert.equal(recommendedPlatform({ platform: "MacIntel", userAgent: "Mac OS X", maxTouchPoints: 0 }), "macos");
  assert.equal(recommendedPlatform({ platform: "MacIntel", userAgent: "Mac OS X", maxTouchPoints: 5 }), null);
  assert.equal(recommendedPlatform({ platform: "iPhone", userAgent: "iPhone like Mac OS X", maxTouchPoints: 5 }), null);
  assert.equal(recommendedPlatform({ platform: "Linux armv8l", userAgent: "Linux; Android", maxTouchPoints: 5 }), null);
  assert.equal(recommendedPlatform({ platform: "Win32", userAgent: "Windows NT 10.0", maxTouchPoints: 0 }), "windows");
  assert.equal(recommendedPlatform({ platform: "Linux x86_64", userAgent: "Linux", maxTouchPoints: 0 }), "linux");
});

test("homepage conversion links expose free downloads and optional membership", () => {
  const nav = read("resources/js/marketing/Nav.jsx");
  const hero = read("resources/js/marketing/HeroScrollStory.jsx");
  const pricing = read("resources/js/marketing/Pricing.jsx");
  const closing = read("resources/js/marketing/Closing.jsx");
  assert.match(nav, /href="\/login"/);
  assert.match(nav, /href="\/downloads"/);
  assert.match(hero, /href="\/downloads"/);
  assert.match(closing, /href="\/downloads"/);
  assert.match(pricing, /\/billing\?plan=/);
  assert.doesNotMatch(`${nav}\n${hero}\n${pricing}\n${closing}`, /href="#join"|Join beta/);
  assert.doesNotMatch(closing, /Join the private beta|waitlist-email/);
});

test("portal source remains within the 200-line contract", () => {
  const roots = [join(backend, "resources/js/portal"), join(backend, "resources/css/portal")];
  const oversized = roots.flatMap(filesUnder).map((file) => ({
    file,
    lines: readFileSync(file, "utf8").split(/\r?\n/).length,
  })).filter(({ lines }) => lines > 200);
  assert.deepEqual(oversized, []);
  const tokens = read("resources/css/portal/tokens.css");
  assert.match(tokens, /#0E0F12/);
  assert.match(tokens, /#4667E8/);
});
