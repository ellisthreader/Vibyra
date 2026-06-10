import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.profile-sessions.js", import.meta.url), "utf8");
const locationSource = readFileSync(new URL("./app.profile-location.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.profile-sessions.css", import.meta.url), "utf8");
const responsiveStyles = readFileSync(new URL("./app.profile-sessions-responsive.css", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");

function renderSessions(sessions) {
  const context = {
    currentState: { machineName: "Ellis PC" },
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    profileDeleteOpen: false,
    profileLogoutAllBusy: false,
    profileSessionBusyId: "",
    profileSessionMenuId: "",
    profileSessions: sessions,
    profileSessionsError: "",
    profileSessionsLoaded: true,
    profileSessionsLoading: false
  };
  vm.runInNewContext(locationSource, context);
  vm.runInNewContext(source, context);
  return vm.runInNewContext("renderProfileSessionsPanel()", context);
}

test("signed-in devices render as a semantic account table", () => {
  const html = renderSessions([{
    current: true,
    deviceName: "Vibyra Desktop",
    id: "desktop-1",
    ipAddress: "203.0.113.10",
    location: "City of London, United Kingdom",
    updatedAt: "2026-06-09T10:30:00.000Z",
    userAgent: "Electron Linux"
  }]);

  assert.match(html, /<table class="profile-device-table">/);
  assert.match(html, /<th scope="col">Device<\/th>/);
  assert.match(html, /<th scope="col">Type<\/th>/);
  assert.match(html, /<th scope="col">Location<\/th>/);
  assert.match(html, /<th scope="col">Last active<\/th>/);
  assert.match(html, /Ellis PC/);
  assert.match(html, /London, UK/);
  assert.match(html, /<small>203\.0\.113\.10<\/small>/);
  assert.match(html, />Desktop<\/td>/);
  assert.match(html, /<em>Current<\/em>/);
  assert.match(html, /data-device-menu="desktop-1"/);
});

test("raw IP fallback is not repeated beneath the location", () => {
  const html = renderSessions([{
    deviceName: "Browser",
    id: "browser-1",
    ipAddress: "203.0.113.20",
    location: "203.0.113.20",
    updatedAt: "2026-06-09T10:30:00.000Z",
    userAgent: "Chrome"
  }]);

  assert.doesNotMatch(html, /<small>203\.0\.113\.20<\/small>/);
});

test("real phone names from account session metadata are preserved", () => {
  const html = renderSessions([{
    deviceName: "Ellis's iPhone",
    id: "phone-1",
    ipAddress: "203.0.113.30",
    location: "London, United Kingdom",
    updatedAt: "2026-06-09T10:30:00.000Z",
    userAgent: "Vibyra iOS"
  }]);

  assert.match(html, /Ellis's iPhone/);
  assert.match(html, />Phone<\/td>/);
});

test("device table keeps a compact labeled mobile layout", () => {
  assert.match(styles, /\.profile-device-table/);
  assert.match(responsiveStyles, /content: attr\(data-label\)/);
  assert.match(responsiveStyles, /@media \(max-width: 720px\)/);
  assert.match(appHtml, /app\.profile-sessions-responsive\.css/);
});
