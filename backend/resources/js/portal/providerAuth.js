import { portalApi } from "./api.js";

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function completeProviderLogin(provider, onStatus, declarations = {}) {
  const popup = window.open("", `vibyra-${provider}-login`, "popup,width=540,height=720");
  if (!popup) throw new Error("Allow pop-ups to continue with this provider.");

  try {
    const name = { google: "Google", apple: "Apple", microsoft: "Microsoft" }[provider] ?? "provider";
    onStatus(`Opening ${name} sign-in…`);
    const start = await portalApi.startProvider(provider, declarations);
    if (!start.authUrl || !start.flowId) throw new Error("The sign-in provider did not start.");
    popup.location.assign(start.authUrl);
    onStatus("Finish signing in in the window that opened.");

    const expiresIn = Number(start.expiresIn);
    const deadline = Date.now() + Math.min(600, Math.max(30,
      Number.isFinite(expiresIn) ? expiresIn : 600)) * 1000;
    while (Date.now() < deadline) {
      await wait(1500);
      if (popup.closed) throw new Error("The sign-in window was closed. Please try again.");
      const result = await portalApi.providerStatus(provider, start.flowId);
      if (result.user || ["complete", "completed", "success"].includes(result.status)) {
        popup.close();
        onStatus("Signed in. Loading your account…");
        return result;
      }
      if (["denied", "expired", "failed", "error"].includes(result.status)) {
        throw new Error(result.error ?? "Provider sign-in was not completed.");
      }
    }
    throw new Error("Provider sign-in timed out. Please try again.");
  } catch (error) {
    popup.close();
    throw error;
  }
}
