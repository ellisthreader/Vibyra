function ensureDesktopSessions() {
  if (!profileSessionsLoaded && !profileSessionsLoading) loadDesktopSessions();
}

function resetProfileSessions() {
  profileSessions = [];
  profileSessionsError = "";
  profileSessionsLoaded = false;
  profileSessionsLoading = false;
  profileSessionBusyId = "";
  profileSessionMenuId = "";
  profileLogoutAllBusy = false;
}

function renderProfileSessionsPanel() {
  const count = profileSessions.length;
  if (profileSessionsLoading && !profileSessionsLoaded) {
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Devices</h2></div><p class="profile-session-empty">Loading devices...</p></section>`;
  }
  if (profileSessionsError) {
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Devices</h2></div><p class="profile-session-empty profile-session-empty--danger">${escapeHtml(profileSessionsError)}</p><button class="secondary-button compact-button" type="button" data-profile-action="reload-sessions">Retry</button></section>`;
  }
  if (!profileSessions.length) {
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Devices</h2></div><p class="profile-session-empty">No signed-in devices found.</p></section>`;
  }
  return `<section class="profile-session-list"><div class="profile-session-head"><h2>Devices</h2><span>${count} device${count === 1 ? "" : "s"}</span></div><div class="profile-device-table" role="table" aria-label="Signed-in devices"><div class="profile-device-row profile-device-row--head" role="row"><span>Device</span><span>Location</span><span>Created</span><span>Updated</span><span></span></div>${profileSessions.map(profileSessionRow).join("")}</div></section>`;
}

function profileSessionRow(session) {
  const id = String(session.deviceId || session.id || "");
  const busy = profileSessionBusyId === id;
  const menuOpen = profileSessionMenuId === id;
  const name = session.deviceName || "Vibyra device";
  const current = session.current ? `<small>Current</small>` : "";
  const menu = menuOpen
    ? `<div class="profile-session-menu"><button type="button" data-device-revoke="${escapeAttribute(id)}" ${busy ? "disabled" : ""}>${busy ? "Terminating..." : "Terminate"}</button></div>`
    : "";
  return `<div class="profile-device-row${session.current ? " is-current" : ""}" role="row">
    <span class="profile-device-name"><i></i><span><strong>${escapeHtml(name)}</strong>${current}</span></span>
    <span>${escapeHtml(session.location || "Unknown")}</span>
    <span>${profileShortDate(session.createdAt)}</span>
    <span>${profileShortDate(session.updatedAt)}</span>
    <span class="profile-session-actions"><button class="profile-session-menu-button" type="button" data-device-menu="${escapeAttribute(id)}" aria-label="Device actions" aria-expanded="${menuOpen ? "true" : "false"}">${icon("menu")}</button>${menu}</span>
  </div>`;
}

function profileShortDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "unknown"
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderAccountActionsPanel(meta) {
  return `<section class="profile-account-actions">
    <button class="profile-account-action" type="button" data-profile-action="logout-all" ${profileLogoutAllBusy ? "disabled" : ""}><span>${profileLogoutAllBusy ? "Logging out..." : "Log out everywhere"}</span>${icon("chevron")}</button>
    <button class="profile-account-action profile-account-action--danger" type="button" data-profile-action="show-delete-account"><span>Delete account</span>${icon("chevron")}</button>
    ${renderDeleteAccountPanel(meta)}
  </section>`;
}

function renderDeleteAccountPanel(meta) {
  if (!profileDeleteOpen) return "";
  return `<div class="profile-delete-confirm"><p>Deletes ${escapeHtml(meta.email || "this account")} and synced Vibyra data.</p><label class="profile-field"><span>Type DELETE</span><input id="profile-delete-confirm" type="text" autocomplete="off" /></label><label class="profile-field"><span>Password</span><input id="profile-delete-password" type="password" autocomplete="current-password" /></label><div class="profile-inline-actions"><button class="danger-button compact-button" type="button" data-profile-action="delete-account" ${profileDeleteBusy ? "disabled" : ""}>${profileDeleteBusy ? "Deleting..." : "Delete account"}</button><button class="secondary-button compact-button" type="button" data-profile-action="hide-delete-account">Cancel</button>${profileDeleteMessage ? `<p class="profile-status profile-status--danger">${escapeHtml(profileDeleteMessage)}</p>` : ""}</div></div>`;
}

async function loadDesktopSessions(force = false) {
  if (profileSessionsLoading || (profileSessionsLoaded && !force)) return;
  const token = desktopAuthSession()?.token;
  if (!token) {
    profileSessionsError = "Log in again to load active sessions.";
    profileSessionsLoaded = true;
    renderProfile();
    return;
  }
  profileSessionsLoading = true;
  profileSessionsError = "";
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/account/sessions`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || result?.message || "Could not load active sessions.");
    profileSessions = Array.isArray(result.devices) ? result.devices : Array.isArray(result.sessions) ? result.sessions : [];
    profileSessionsLoaded = true;
  } catch (error) {
    profileSessionsError = error instanceof Error ? error.message : "Could not load active sessions.";
  } finally {
    profileSessionsLoading = false;
    renderProfile();
  }
}

async function revokeDesktopDevice(deviceId) {
  const token = desktopAuthSession()?.token;
  if (!token || !deviceId) return;
  const target = profileSessions.find((device) => String(device.id) === String(deviceId));
  if (target?.current && !window.confirm("Terminate this device? This desktop will be signed out.")) return;
  profileSessionBusyId = String(deviceId);
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/account/devices/${encodeURIComponent(deviceId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || result?.message || "Could not terminate this device.");
    if (result.currentRevoked) {
      if (typeof desktopSignOut === "function") desktopSignOut();
      return;
    }
    profileSessionMenuId = "";
    profileSessionsLoaded = false;
    await loadDesktopSessions(true);
  } catch (error) {
    profileSessionsError = error instanceof Error ? error.message : "Could not terminate this device.";
  } finally {
    profileSessionBusyId = "";
    renderProfile();
  }
}

async function logoutAllDesktopSessions() {
  const token = desktopAuthSession()?.token;
  if (!token || profileLogoutAllBusy) return;
  const ok = window.confirm("Log out of all Vibyra devices? This ends every active session, including this desktop.");
  if (!ok) return;
  profileLogoutAllBusy = true;
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/account/sessions`, {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || result?.message || "Could not log out all devices.");
    if (typeof desktopSignOut === "function") desktopSignOut();
  } catch (error) {
    profileSessionsError = error instanceof Error ? error.message : "Could not log out all devices.";
  } finally {
    profileLogoutAllBusy = false;
    renderProfile();
  }
}
