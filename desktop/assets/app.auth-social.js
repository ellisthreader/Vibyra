let desktopSocialAuthProvider = "";

async function beginDesktopSocialAuth(provider) {
  if (desktopSocialAuthProvider) return;
  desktopSocialAuthProvider = provider;
  clearAuthError();
  setDesktopSocialAuthStatus(`Opening ${provider === "apple" ? "Apple" : "Google"} sign-in...`);
  setDesktopSocialAuthBusy(provider, true);

  const electronShell = typeof isElectronShell === "function" && isElectronShell();
  const popup = electronShell ? null : window.open("about:blank", "_blank");
  try {
    const publicIp = await desktopPublicIp();
    const response = await fetch(`/desktop/auth/${provider}/start`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        deviceName: desktopAuthDeviceName(),
        installId: desktopInstallId(),
        ...(publicIp ? { publicIp } : {})
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.authUrl || !result.flowId) {
      throw new Error(result.error || `Could not start ${provider} sign-in.`);
    }

    if (popup) popup.location.href = result.authUrl;
    else window.open(result.authUrl, "_blank", "noopener");
    setDesktopSocialAuthStatus(
      `Finish signing in with ${provider === "apple" ? "Apple" : "Google"} in your browser.`
    );
    await waitForDesktopSocialAuth(provider, result.flowId, Number(result.expiresIn) || 600);
  } catch (error) {
    if (popup && !popup.closed) popup.close();
    setDesktopSocialAuthStatus(
      error instanceof Error ? error.message : `Could not sign in with ${provider}.`,
      true
    );
  } finally {
    desktopSocialAuthProvider = "";
    setDesktopSocialAuthBusy(provider, false);
  }
}

async function waitForDesktopSocialAuth(provider, flowId, expiresIn) {
  const deadline = Date.now() + Math.min(Math.max(expiresIn, 60), 600) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const response = await fetch(
      `/desktop/auth/${provider}/status/${encodeURIComponent(flowId)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "This sign-in attempt expired. Try again.");
    if (result.status === "pending") continue;
    if (result.status === "complete" && result.token && result.user) {
      setDesktopSocialAuthStatus("Sign-in complete.");
      await completeDesktopAuth(result.token, result.user, result.isNewUser);
      return;
    }
    throw new Error(result.error || `Could not sign in with ${provider}.`);
  }
  throw new Error("This sign-in attempt expired. Try again.");
}

function setDesktopSocialAuthStatus(message, error = false) {
  const status = document.getElementById("desktop-social-auth-status");
  if (!status) return;
  status.textContent = String(message || "");
  status.classList.toggle("visible", Boolean(message));
  status.classList.toggle("error", Boolean(message) && error);
}

function setDesktopSocialAuthBusy(provider, busy) {
  document.querySelectorAll("[data-auth-social]").forEach((button) => {
    const selected = button.dataset.authSocial === provider;
    button.disabled = busy;
    button.toggleAttribute("aria-busy", busy && selected);
    const label = button.querySelector("strong");
    if (!label) return;
    if (!label.dataset.defaultLabel) label.dataset.defaultLabel = label.textContent;
    label.textContent = busy && selected
      ? `Waiting for ${provider === "apple" ? "Apple" : "Google"}...`
      : label.dataset.defaultLabel;
  });
}
