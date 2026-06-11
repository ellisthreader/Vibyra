import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.auth-social.js", import.meta.url), "utf8");

test("social auth click shows backend configuration errors in the visible auth area", async () => {
  const classes = new Set();
  const status = {
    textContent: "",
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
  const label = { textContent: "Continue with Google", dataset: {} };
  const button = {
    dataset: { authSocial: "google" },
    disabled: false,
    querySelector: () => label,
    toggleAttribute() {}
  };
  const context = {
    clearAuthError() {},
    console,
    desktopAuthDeviceName: () => "Test PC",
    desktopInstallId: () => "desktop-test",
    desktopPublicIp: async () => "",
    document: {
      getElementById: (id) => id === "desktop-social-auth-status" ? status : null,
      querySelectorAll: () => [button]
    },
    fetch: async () => ({
      ok: false,
      async json() {
        return { error: "Google desktop sign-in is not configured." };
      }
    }),
    isElectronShell: () => true,
    window: { open() {} }
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  await context.beginDesktopSocialAuth("google");

  assert.equal(status.textContent, "Google desktop sign-in is not configured.");
  assert.equal(classes.has("visible"), true);
  assert.equal(classes.has("error"), true);
  assert.equal(button.disabled, false);
  assert.equal(label.textContent, "Continue with Google");
});
