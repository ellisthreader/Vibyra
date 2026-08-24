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

test("portal keeps account sessions but makes desktop downloads public", () => {
  const api = read("resources/js/portal/api.js");
  const downloads = read("resources/js/portal/pages/DownloadsPage.jsx");
  const downloadCard = read("resources/js/portal/components/DownloadCard.jsx");
  const platformRow = read("resources/js/portal/components/PlatformRow.jsx");
  const linuxCard = read("resources/js/portal/components/LinuxDownloadCard.jsx");
  const macDownloadCard = read('resources/js/portal/components/MacDownloadCard.jsx');
  const appleIcon = read("public/platform-icons/apple.svg");
  const routes = read("routes/web.php");
  assert.match(api, /\/web-api\/session/);
  assert.match(api, /credentials: "same-origin"/);
  assert.match(api, /X-CSRF-TOKEN/);
  assert.match(api, /`\/downloads\/\$\{encodeURIComponent\(platform\)\}`/);
  assert.match(downloads, /\["windows", "linux", "macos"\]/);
  assert.match(downloads, /recommendedPlatform/);
  assert.match(downloads, /First public beta/);
  assert.match(downloads, /Rebuilt from the ground up in Rust/);
  assert.match(downloads, /Download Vibyra Desktop beta \| Vibyra/);
  assert.doesNotMatch(downloads, /useWebsiteSession|membership-required/);
  assert.match(platformRow, /platform-icons\/microsoft\.svg/);
  assert.match(platformRow, /platform-icons\/linux-tux\.svg/);
  assert.match(platformRow, /platform-icons\/apple\.svg/);
  assert.match(downloadCard, /href=\{downloadPath\("windows"\)\}/);
  assert.match(downloadCard, /`Beta \$\{release\.version\}`/);
  assert.match(linuxCard, /href=\{downloadPath\("linux-deb"\)\}/);
  assert.match(linuxCard, /sudo apt install ~\/Downloads\/Vibyra\.deb/);
  assert.match(linuxCard, /curl -L -o ~\/Vibyra\.AppImage/);
  assert.match(linuxCard, /chmod \+x ~\/Vibyra\.AppImage && ~\/Vibyra\.AppImage/);
  assert.match(linuxCard, /window\.location\.origin/);
  assert.doesNotMatch(linuxCard, /npm install|libfuse|<details/);
  assert.match(macDownloadCard, /macos-arm64/);
  assert.match(macDownloadCard, /macos-x64/);
  assert.match(macDownloadCard, /Apple Silicon/);
  assert.match(macDownloadCard, /Intel-based Macs/);
  assert.match(macDownloadCard, /minimumSystemVersion/);
  assert.doesNotMatch(macDownloadCard, /navigator|userAgent|userAgentData/);
  assert.match(appleIcon, /<title[^>]*>Apple<\/title>/);
  assert.match(appleIcon, /<path fill="#F5F5F7"/);
  assert.doesNotMatch(appleIcon, /<text|data:image/);
  assert.doesNotMatch(downloadCard, /<dl|<details/);
  assert.match(routes, /Route::view\('\/downloads', 'portal'\)/);
  assert.match(routes, /Route::get\('\/web-api\/releases'/);
  assert.match(routes, /\['windows', 'linux', 'linux-deb', 'macos-arm64', 'macos-x64'\]/);
});

test("the download page says it is beta and that the app updates itself", () => {
  const downloads = read("resources/js/portal/pages/DownloadsPage.jsx");
  const beta = read("resources/js/portal/components/BetaBanner.jsx");
  const updates = read("resources/js/portal/components/UpdatesItself.jsx");
  const whatsNew = read("resources/js/portal/components/WhatsNew.jsx");

  // All three sections have to be mounted — each has been the whole point of a
  // separate request, and a silently dropped import would read as "shipped".
  for (const component of ["BetaBanner", "UpdatesItself", "WhatsNew"]) {
    assert.match(downloads, new RegExp(`<${component}`), `${component} is not rendered`);
  }

  // Beta status must be stated, not implied by a version number.
  assert.match(beta, /early software/);
  assert.match(beta, /Free while in beta/);

  // The promise a first-time visitor needs: this page is a one-time visit.
  assert.match(updates, /Download once\. Never again\./);
  assert.match(updates, /updates itself/i);
  assert.match(updates, /one click/i);

  // The version badge is fed from the release feed, never hardcoded.
  assert.match(whatsNew, /\{version\}/);
  assert.doesNotMatch(whatsNew, /Beta 0\.\d+\.\d+/);
  assert.match(whatsNew, /Typing that keeps up/);
  assert.match(whatsNew, /Updates from Settings/);
  assert.match(whatsNew, /Terminal performance fixed/);
  assert.match(whatsNew, /Correct character spacing/);
  assert.match(whatsNew, /Lower CPU usage/);
  assert.match(whatsNew, /Reliable fast input/);
  assert.match(downloads, /latestVersion\(releases\)/);
});

test("macOS recommendation excludes iPhone and iPad browsers", async () => {
  const { recommendedPlatform } = await import("./platform.js");
  assert.equal(recommendedPlatform({ platform: "MacIntel", userAgent: "Mac OS X", maxTouchPoints: 0 }), "macos");
  assert.equal(recommendedPlatform({ platform: "MacIntel", userAgent: "Mac OS X", maxTouchPoints: 5 }), null);
  assert.equal(recommendedPlatform({ platform: "iPhone", userAgent: "iPhone like Mac OS X", maxTouchPoints: 5 }), null);
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
