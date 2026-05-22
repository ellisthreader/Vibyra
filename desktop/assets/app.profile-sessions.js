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
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2></div><p class="profile-session-empty">Loading devices...</p></section>`;
  }
  if (profileSessionsError) {
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2></div><p class="profile-session-empty profile-session-empty--danger">${escapeHtml(profileSessionsError)}</p><button class="secondary-button compact-button" type="button" data-profile-action="reload-sessions">Retry</button></section>`;
  }
  if (!profileSessions.length) {
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2></div><p class="profile-session-empty">No signed-in devices found.</p></section>`;
  }
  return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2><span>${count} device${count === 1 ? "" : "s"}</span></div><div class="profile-device-list" role="list" aria-label="Signed-in devices">${profileSortedSessions().map(profileSessionRow).join("")}</div></section>`;
}

function profileSessionRow(session) {
  const id = profileDeviceId(session);
  const busy = profileSessionBusyId === id;
  const menuOpen = profileSessionMenuId === id;
  const name = profileDeviceName(session);
  const location = profileDeviceLocation(session);
  const kind = profileDeviceKind(session);
  const current = session.current ? `<em>Current</em>` : "";
  const updated = profileShortDate(session.updatedAt);
  const menu = menuOpen
    ? `<div class="profile-session-menu"><button type="button" data-device-revoke="${escapeAttribute(id)}" ${busy ? "disabled" : ""}>${busy ? "Terminating..." : "Terminate"}</button></div>`
    : "";
  return `<div class="profile-device-row${session.current ? " is-current" : ""}" role="listitem">
    <span class="profile-device-dot" aria-hidden="true"></span>
    <span class="profile-device-name"><strong>${escapeHtml(name)}</strong><small>${current}<span>${escapeHtml(kind)} &middot; ${escapeHtml(location)}</span></small></span>
    <span class="profile-device-activity" aria-label="Last active ${escapeAttribute(updated)}"><strong>${escapeHtml(updated)}</strong></span>
    <span class="profile-session-actions"><button class="profile-session-menu-button" type="button" data-device-menu="${escapeAttribute(id)}" aria-label="Device actions" aria-expanded="${menuOpen ? "true" : "false"}">${icon("menu")}</button>${menu}</span>
  </div>`;
}

function profileSortedSessions() {
  return [...profileSessions].sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
}

function profileDeviceId(session) {
  return String(session?.deviceId || session?.id || "");
}

function profileDeviceName(session) {
  const raw = String(session?.deviceName || "").trim();
  const userAgent = String(session?.userAgent || "");
  if (session?.current && isGenericDesktopName(raw) && currentState.machineName) return currentState.machineName;
  if (isGenericPhoneName(raw)) {
    if (/iphone/i.test(userAgent)) return "iPhone";
    if (/ipad/i.test(userAgent)) return "iPad";
    if (/android/i.test(userAgent)) return "Android phone";
  }
  if (raw) return raw;
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/android/i.test(userAgent)) return "Android phone";
  return "Vibyra device";
}

function profileDeviceLocation(session) {
  return String(session?.location || session?.ipAddress || "Unknown location").trim() || "Unknown location";
}

function profileDeviceKind(session) {
  const text = `${session?.deviceName || ""} ${session?.userAgent || ""}`.toLowerCase();
  if (/iphone|ipad|android|phone|mobile|vibyra app/.test(text)) return "Phone";
  if (/desktop|windows|macintosh|linux|x11|electron/.test(text)) return "Desktop";
  return "Device";
}

function isGenericDesktopName(value) {
  return /^vibyra desktop$/i.test(String(value || "").trim());
}

function isGenericPhoneName(value) {
  return /^vibyra app$/i.test(String(value || "").trim());
}

function profileShortDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "unknown"
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderAccountActionsPanel(meta) {
  const deleteOpen = profileDeleteOpen ? " is-open" : "";
  return `<section class="profile-account-actions">
    <h2>Account actions</h2>
    <button class="profile-account-action" type="button" data-profile-action="logout-all" ${profileLogoutAllBusy ? "disabled" : ""}><span>${profileLogoutAllBusy ? "Logging out..." : "Log out everywhere"}</span>${icon("chevron")}</button>
    <button class="profile-account-action profile-account-action--danger${deleteOpen}" type="button" data-profile-action="${profileDeleteOpen ? "hide-delete-account" : "show-delete-account"}" aria-expanded="${profileDeleteOpen ? "true" : "false"}"><span>Delete account</span>${icon("chevron")}</button>
    ${renderDeleteAccountPanel(meta)}
  </section>`;
}

function renderDeleteAccountPanel(meta) {
  if (!profileDeleteOpen) return "";
  const target = meta.email || "this account";
  return `<div class="profile-delete-confirm"><div class="profile-delete-warning"><span>${icon("alert")}</span><div><strong>Delete ${escapeHtml(target)} permanently?</strong><p>Everything tied to this Vibyra account will be deleted, including synced data, saved account details, and active sessions. This cannot be undone.</p></div></div><label class="profile-field"><span>Password</span><input id="profile-delete-password" type="password" autocomplete="current-password" placeholder="Confirm with your password" /></label><div class="profile-inline-actions"><button class="danger-button compact-button profile-delete-submit" type="button" data-profile-action="delete-account" ${profileDeleteBusy ? "disabled" : ""}>${profileDeleteBusy ? "Deleting..." : "Delete permanently"}</button><button class="secondary-button compact-button" type="button" data-profile-action="hide-delete-account">Cancel</button>${profileDeleteMessage ? `<p class="profile-status profile-status--danger">${escapeHtml(profileDeleteMessage)}</p>` : ""}</div></div>`;
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
      headers: await desktopAccountHeaders(token)
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
  const target = profileSessions.find((device) => profileDeviceId(device) === String(deviceId));
  if (target?.current && !window.confirm("Terminate this device? This desktop will be signed out.")) return;
  profileSessionBusyId = String(deviceId);
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/account/devices/${encodeURIComponent(deviceId)}`, {
      method: "DELETE",
      headers: await desktopAccountHeaders(token)
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
      headers: await desktopAccountHeaders(token)
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
