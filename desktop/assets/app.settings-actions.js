function saveDesktopPersonalization() {
  const prefs = desktopPreferences();
  const callName = document.getElementById("profile-call-name");
  const responseStyle = document.getElementById("profile-response-style");
  const workType = document.getElementById("profile-work-type");
  const workOther = document.getElementById("profile-work-other");
  const instructions = document.getElementById("profile-instructions");
  if (callName) prefs.callName = callName.value.trim();
  if (responseStyle) prefs.responseStyle = responseStyle.value;
  if (workType) prefs.workType = workType.value;
  if (workOther) prefs.workOther = workOther.value.trim();
  if (instructions) prefs.customInstructions = instructions.value.trim();
  saveDesktopPreferences(prefs);
  const status = document.querySelector("[data-personalization-status]");
  if (status) status.textContent = "Saved on this desktop.";
}

function requestSettingsConfirmation(action) {
  profileConfirmAction = String(action || "");
  renderProfile();
  requestAnimationFrame(() => {
    profileRenderTarget()?.querySelector("[data-profile-action='confirm-settings-action']")?.focus();
  });
}

function cancelSettingsConfirmation() {
  profileConfirmAction = "";
  renderProfile();
}

function renderSettingsConfirmation() {
  if (!profileConfirmAction) return "";
  const revoke = profileConfirmAction.startsWith("revoke:");
  const content = revoke
    ? {
        title: "Terminate this desktop session?",
        body: "This computer will be signed out immediately.",
        action: "Terminate session"
      }
    : profileConfirmAction === "logout-all"
      ? {
          title: "Log out everywhere?",
          body: "Every active Vibyra session, including this desktop, will end.",
          action: "Log out everywhere"
        }
      : {
          title: "Clear local cache?",
          body: "Local chats, drafts, project state, and interface preferences will be removed. Your account stays signed in.",
          action: "Clear local cache"
        };
  return `<section class="profile-inline-confirm" role="alert" aria-live="assertive">
    <div><strong>${content.title}</strong><p>${content.body}</p></div>
    <div class="profile-inline-actions">
      <button class="danger-button compact-button" type="button" data-profile-action="confirm-settings-action">${content.action}</button>
      <button class="secondary-button compact-button" type="button" data-profile-action="cancel-settings-action">Cancel</button>
    </div>
  </section>`;
}

function confirmSettingsAction() {
  const action = profileConfirmAction;
  profileConfirmAction = "";
  if (action === "clear-cache") {
    clearDesktopCache();
    return;
  }
  if (action === "logout-all") {
    void logoutAllDesktopSessions(true);
    return;
  }
  if (action.startsWith("revoke:")) void revokeDesktopDevice(action.slice(7), true);
}

function clearDesktopCache() {
  const keep = new Set(["vibyra.desktop.auth", "vibyra.desktop.install", "vibyra.api.url"]);
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("vibyra.desktop.") && !keep.has(key))
      .forEach((key) => localStorage.removeItem(key));
  } catch {}
  window.location.reload();
}

async function deleteDesktopProviderAccount(provider) {
  if (profileDeleteBusy) return;
  profileDeleteBusy = true;
  profileDeleteMessage = `Opening ${provider === "apple" ? "Apple" : "Google"} verification...`;
  renderProfile();
  try {
    const response = await fetch(`/desktop/account-api/provider-delete/${provider}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.authUrl || !result.flowId) {
      throw new Error(result.error || "Could not start account verification.");
    }
    window.open(result.authUrl, "_blank", "noopener");
    profileDeleteMessage = `Finish verification with ${provider === "apple" ? "Apple" : "Google"} in your browser.`;
    renderProfile();
    await pollDesktopProviderDeletion(provider, result.flowId, Number(result.expiresIn) || 600);
    if (typeof desktopSignOut === "function") desktopSignOut();
  } catch (error) {
    profileDeleteMessage = error instanceof Error ? error.message : "Could not verify account deletion.";
    profileDeleteBusy = false;
    renderProfile();
  }
}

async function pollDesktopProviderDeletion(provider, flowId, expiresIn) {
  const deadline = Date.now() + Math.max(30, expiresIn) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(
      `/desktop/account-api/provider-delete/${provider}/status/${encodeURIComponent(flowId)}`
    );
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.status === "pending") continue;
    if (response.ok && result.status === "complete" && result.deleted) return;
    throw new Error(result.error || "Account verification did not complete.");
  }
  throw new Error("Account verification expired. Try again.");
}
