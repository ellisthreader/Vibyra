import { portalApi } from "./api.js";

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function completeProviderLogin(provider, onStatus) {
  const popup = window.open("", `vibyra-${provider}-login`, "popup,width=540,height=720");
  if (!popup) throw new Error("Allow pop-ups to continue with this provider.");

  try {
    onStatus(`Opening ${provider === "apple" ? "Apple" : "Google"} sign-in…`);
    const start = await portalApi.startProvider(provider);
    if (!start.authUrl || !start.flowId) throw new Error("The sign-in provider did not start.");
    popup.location.assign(start.authUrl);
    onStatus("Finish signing in in the window that opened.");

    for (let attempt = 0; attempt < 80; attempt += 1) {
      await wait(1500);
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
