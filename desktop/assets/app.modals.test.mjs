import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.modals.js", import.meta.url), "utf8");
const lifecycleSource = readFileSync(new URL("./app.modal-lifecycle.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const pairing = readFileSync(new URL("./app.pairing.js", import.meta.url), "utf8");
const pairingStyles = readFileSync(new URL("./app.pairing.css", import.meta.url), "utf8");
const pairingPermissionStyles = readFileSync(new URL("./app.pairing-permission.css", import.meta.url), "utf8");
const pairingSuccessStyles = readFileSync(new URL("./app.pairing-success.css", import.meta.url), "utf8");
const desktopRoutes = readFileSync(new URL("../lib/desktopRoutes.mjs", import.meta.url), "utf8");

class FakeElement {
  constructor(document, id = "") {
    this.ownerDocument = document;
    this.id = id;
    this.attributes = new Map();
    this.children = [];
    this.focusables = [];
    this.hidden = false;
    this.inert = false;
    this.isConnected = true;
    this.parentElement = null;
    this.classList = {
      values: new Set(),
      add: (...values) => values.forEach((value) => this.classList.values.add(value)),
      remove: (...values) => values.forEach((value) => this.classList.values.delete(value)),
      contains: (value) => this.classList.values.has(value)
    };
  }
  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }
  contains(element) {
    return element === this || this.children.some((child) => child.contains(element));
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  querySelector(selector) {
    if (selector.includes("data-modal-close") || selector.includes(".modal-header")) return this.closeButton || null;
    if (selector === ".modal") return this.panel || null;
    return null;
  }
  querySelectorAll() {
    return this.focusables;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function modalHarness() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, listener) { listeners.set(type, listener); },
    getElementById(id) { return this.byId.get(id) || null; },
    querySelector(selector) { return selector === ".app" ? this.app : null; },
    byId: new Map()
  };
  document.app = new FakeElement(document, "app");
  const dock = new FakeElement(document, "mobile-dock");
  const accountButton = new FakeElement(document, "open-account-menu");
  document.byId.set("mobile-dock", dock);
  document.byId.set("open-account-menu", accountButton);

  const createModal = (id) => {
    const modal = new FakeElement(document, id);
    const panel = new FakeElement(document, `${id}-panel`);
    const close = new FakeElement(document, `${id}-close`);
    const action = new FakeElement(document, `${id}-action`);
    modal.panel = panel;
    modal.closeButton = close;
    modal.focusables = [close, action];
    modal.append(panel, close, action);
    return { modal, close, action };
  };
  const profile = createModal("profile-modal");
  const pair = createModal("pair-modal");
  const token = createModal("token-modal");
  const context = vm.createContext({
    console,
    document,
    globalThis: null,
    nodes: {
      pairModal: pair.modal,
      profileModal: profile.modal,
      tokenModal: token.modal
    },
    profileActiveSection: "app",
    profileBillingCancelOpen: false,
    profileBillingManageOpen: false,
    profileBillingPlanOpen: false,
    profileFocus: "",
    profileModalOpen: false,
    profileSectionSearch: "",
    profileSessionMenuId: "",
    renderPairModal() {},
    renderProfileModal() {},
    renderTopbar() {},
    requestAnimationFrame(callback) { callback(); },
    resetProfileModalScroll() {},
    setProfileFocus() {},
    tokenModalView: "profile",
    topbarAccountMenuOpen: false,
    topbarChatMenuOpen: false
  });
  context.globalThis = context;
  vm.runInContext(lifecycleSource, context);
  vm.runInContext(source, context);
  return { accountButton, context, document, dock, pair, profile, token };
}

test("paid accounts do not render Manage billing in the account dropdown", () => {
  assert.match(source, /const upgradeSection = tier\.key === "free"/);
  assert.doesNotMatch(source, /const upgradeLabel = .*Manage billing/);
  assert.doesNotMatch(source, /else manageDesktopBilling\(\)/);
});

test("free accounts retain the Upgrade plan shortcut", () => {
  assert.match(source, /data-account-action="upgrade"/);
  assert.match(source, />Upgrade plan</);
});

test("closing settings collapses membership management", () => {
  assert.match(source, /profileBillingManageOpen = false/);
  assert.match(source, /profileBillingCancelOpen = false/);
});

test("pairing modal renders separate waiting, approval, phone confirmation, and connected states", () => {
  assert.match(source, /pairingWaitingView/);
  assert.match(source, /pairingApprovalView/);
  assert.match(source, /pairStatus === "approved"/);
  assert.match(source, /pairingPhonePermissionView/);
  assert.match(source, /pairingConnectedView/);
  assert.match(pairing, /desktop\/pair-qr\.svg/);
  assert.match(pairing, /Pairing stays on this Wi-Fi/);
  assert.match(pairing, /Waiting for your phone/);
  assert.match(pairing, /Confirm the permission request in Vibyra/);
  assert.doesNotMatch(pairing, /token|account identity/i);
});

test("pairing UI stays compact, responsive, and reduced-motion aware", () => {
  assert.match(pairingStyles, /\.pair-modal-panel/);
  assert.match(pairingStyles, /max-width: 590px/);
  assert.match(pairingStyles, /prefers-reduced-motion/);
  assert.match(pairingStyles, /max-width: 460px/);
  assert.match(pairingPermissionStyles, /pair-flow--phone-permission/);
  assert.match(pairingPermissionStyles, /prefers-reduced-motion/);
});

test("production pairing does not expose the temporary test connection path", () => {
  assert.doesNotMatch(pairing, /test-pair-connected|Test connected state/);
  assert.doesNotMatch(source, /desktop\/pair-test-connect/);
  assert.doesNotMatch(pairingStyles, /pair-test-button/);
  assert.doesNotMatch(desktopRoutes, /desktop\/pair-test-connect|Test phone/);
});

test("connected pairing celebrates once and respects reduced motion", () => {
  assert.match(pairing, /role="status" aria-live="polite"/);
  assert.match(pairing, /pair-success-burst/);
  assert.match(pairing, /pair-success-ring/);
  assert.match(pairingSuccessStyles, /@keyframes pair-success-check/);
  assert.match(pairingSuccessStyles, /@keyframes pair-success-particle/);
  assert.match(pairingSuccessStyles, /prefers-reduced-motion/);
  assert.doesNotMatch(pairingSuccessStyles, /infinite/);
});

test("modal lifecycle focuses inside, traps focus, closes on Escape, and restores background", () => {
  const { context, document, dock, pair, profile } = modalHarness();
  const lifecycle = context.__vibyraModalLifecycle;
  const pageOpener = new FakeElement(document, "page-opener");
  document.activeElement = pageOpener;

  lifecycle.open(profile.modal, () => lifecycle.close(profile.modal), pageOpener);
  assert.equal(document.activeElement, profile.close);
  assert.equal(document.app.inert, true);
  assert.equal(dock.inert, true);
  assert.equal(document.app.getAttribute("aria-hidden"), "true");

  document.activeElement = profile.action;
  lifecycle.open(pair.modal, () => lifecycle.close(pair.modal), profile.action);
  assert.equal(profile.modal.inert, true);
  assert.equal(pair.modal.inert, false);
  assert.equal(document.activeElement, pair.close);

  document.activeElement = pair.action;
  const tab = { key: "Tab", shiftKey: false, preventDefault() { this.prevented = true; } };
  lifecycle.handleKeydown(tab);
  assert.equal(tab.prevented, true);
  assert.equal(document.activeElement, pair.close);

  const reverseTab = { key: "Tab", shiftKey: true, preventDefault() { this.prevented = true; } };
  lifecycle.handleKeydown(reverseTab);
  assert.equal(reverseTab.prevented, true);
  assert.equal(document.activeElement, pair.action);

  const escape = {
    key: "Escape",
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  };
  lifecycle.handleKeydown(escape);
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);
  assert.equal(pair.modal.classList.contains("open"), false);
  assert.equal(profile.modal.inert, false);
  assert.equal(document.app.inert, true);
  assert.equal(document.activeElement, profile.action);

  lifecycle.close(profile.modal);
  assert.equal(document.app.inert, false);
  assert.equal(dock.inert, false);
  assert.equal(document.app.getAttribute("aria-hidden"), null);
  assert.equal(document.activeElement, pageOpener);
});

test("account actions route Profile and Settings deterministically", () => {
  const profileHarness = modalHarness();
  profileHarness.document.activeElement = new FakeElement(profileHarness.document, "profile-action");
  profileHarness.context.handleAccountAction("profile");
  assert.equal(profileHarness.context.profileActiveSection, "profile");

  const settingsHarness = modalHarness();
  settingsHarness.document.activeElement = new FakeElement(settingsHarness.document, "settings-action");
  settingsHarness.context.handleAccountAction("settings");
  assert.equal(settingsHarness.context.profileActiveSection, "app");
});

test("modal markup preserves dialog labels and starts hidden from assistive technology", () => {
  for (const id of ["pair-modal", "token-modal", "profile-modal"]) {
    assert.match(markup, new RegExp(`id="${id}"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="[^"]+"[^>]*aria-hidden="true"`));
  }
  assert.equal((markup.match(/data-modal-close/g) || []).length, 3);
});
