const profileSessionsRequestTimeoutMs = 12000;
let profileSessionsRequestId = 0;
let profileSessionsAbortController = null;

function ensureDesktopSessions() {
  if (!profileSessionsLoaded && !profileSessionsLoading) loadDesktopSessions();
}
function resetProfileSessions() {
  profileSessionsRequestId += 1;
  profileSessionsAbortController?.abort();
  profileSessionsAbortController = null;
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
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2></div><p class="profile-session-empty" role="status" aria-live="polite">Loading devices...</p></section>`;
  }
  if (profileSessionsError) {
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2></div><p class="profile-session-empty profile-session-empty--danger">${escapeHtml(profileSessionsError)}</p><button class="secondary-button compact-button" type="button" data-profile-action="reload-sessions">Retry</button></section>`;
  }
  if (!profileSessions.length) {
    return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2></div><p class="profile-session-empty">No signed-in devices found.</p></section>`;
  }
  return `<section class="profile-session-list"><div class="profile-session-head"><h2>Signed-in devices</h2><span>${count} device${count === 1 ? "" : "s"}</span></div>
    <div class="profile-device-table-wrap">
      <table class="profile-device-table"><caption class="profile-visually-hidden">Devices currently signed in to this Vibyra account</caption>
        <thead><tr><th scope="col">Device</th><th scope="col">Type</th><th scope="col">Location</th><th scope="col">Last active</th><th scope="col"><span class="profile-visually-hidden">Actions</span></th></tr></thead>
        <tbody>${profileSortedSessions().map(profileSessionRow).join("")}</tbody>
      </table>
    </div></section>`;
}

function profileSessionRow(session) {
  const id = profileDeviceId(session);
  const busy = profileSessionBusyId === id;
  const menuOpen = profileSessionMenuId === id;
  const name = profileDeviceName(session);
  const location = profileDeviceLocation(session);
  const ipAddress = profileDeviceIp(session, location);
  const kind = profileDeviceKind(session);
  const current = session.current ? `<em>Current</em>` : "";
  const updated = profileShortDate(session.updatedAt);
  const menu = menuOpen
    ? `<div class="profile-session-menu" role="menu"><button type="button" role="menuitem" data-device-revoke="${escapeAttribute(id)}" ${busy ? "disabled" : ""}>${busy ? "Terminating..." : "Terminate"}</button></div>`
    : "";
  return `<tr class="profile-device-row${session.current ? " is-current" : ""}">
    <td class="profile-device-name" data-label="Device"><span class="profile-device-dot" aria-hidden="true"></span><strong>${escapeHtml(name)}</strong>${current}</td>
    <td class="profile-device-kind" data-label="Type">${escapeHtml(kind)}</td>
    <td class="profile-device-location" data-label="Location"><span>${escapeHtml(location)}</span>${ipAddress ? `<small>${escapeHtml(ipAddress)}</small>` : ""}</td>
    <td class="profile-device-activity" data-label="Last active"><time datetime="${escapeAttribute(session.updatedAt || "")}">${escapeHtml(updated)}</time></td>
    <td class="profile-session-actions"><button class="profile-session-menu-button" type="button" data-device-menu="${escapeAttribute(id)}" aria-label="Actions for ${escapeAttribute(name)}" aria-haspopup="menu" aria-expanded="${menuOpen ? "true" : "false"}">${icon("menu")}</button>${menu}</td>
  </tr>`;
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

function profileDeviceKind(session) {
  const text = `${session?.deviceName || ""} ${session?.userAgent || ""}`.toLowerCase();
  if (/ipad|tablet/.test(text)) return "Tablet";
  if (/iphone|android|phone|mobile|vibyra app/.test(text)) return "Phone";
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
  const provider = String(meta.account.provider || "email").toLowerCase();
  const providerLabel = provider === "apple" ? "Apple" : "Google";
  const verification = provider === "email"
    ? `<label class="profile-field"><span>Password</span><input id="profile-delete-password" type="password" autocomplete="current-password" placeholder="Confirm with your password" /></label>`
    : `<p class="profile-section-copy">You will reauthenticate with ${providerLabel} in your browser before deletion.</p>`;
  const action = profileDeleteBusy
    ? (provider === "email" ? "Deleting..." : `Waiting for ${providerLabel}...`)
    : (provider === "email" ? "Delete permanently" : `Continue with ${providerLabel}`);
  return `<div class="profile-delete-confirm"><div class="profile-delete-warning"><span>${icon("alert")}</span><div><strong>Delete ${escapeHtml(target)} permanently?</strong><p>Everything tied to this Vibyra account will be deleted, including synced data, saved account details, and active sessions. This cannot be undone.</p></div></div>${verification}<div class="profile-inline-actions"><button class="danger-button compact-button profile-delete-submit" type="button" data-profile-action="delete-account" ${profileDeleteBusy ? "disabled" : ""}>${action}</button><button class="secondary-button compact-button" type="button" data-profile-action="hide-delete-account">Cancel</button>${profileDeleteMessage ? `<p class="profile-status profile-status--danger" role="status" aria-live="polite">${escapeHtml(profileDeleteMessage)}</p>` : ""}</div></div>`;
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
  const requestId = ++profileSessionsRequestId;
  const controller = new AbortController();
  profileSessionsAbortController = controller;
  const timeoutId = setTimeout(() => controller.abort(), profileSessionsRequestTimeoutMs);
  profileSessionsLoading = true;
  profileSessionsError = "";
  renderProfile();
  try {
    const response = await fetch("/desktop/account-api/sessions", { signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || result?.message || "Could not load active sessions.");
    if (requestId !== profileSessionsRequestId) return;
    profileSessions = Array.isArray(result.devices) ? result.devices : Array.isArray(result.sessions) ? result.sessions : [];
    profileSessionsLoaded = true;
  } catch (error) {
    if (requestId !== profileSessionsRequestId) return;
    profileSessionsError = error?.name === "AbortError"
      ? "Loading active sessions timed out."
      : error instanceof Error ? error.message : "Could not load active sessions.";
    profileSessionsLoaded = true;
  } finally {
    clearTimeout(timeoutId);
    if (requestId !== profileSessionsRequestId) return;
    profileSessionsAbortController = null;
    profileSessionsLoading = false;
    renderProfile();
  }
}

async function revokeDesktopDevice(deviceId, confirmed = false) {
  const token = desktopAuthSession()?.token;
  if (!token || !deviceId) return;
  const target = profileSessions.find((device) => profileDeviceId(device) === String(deviceId));
  if (target?.current && !confirmed) {
    requestSettingsConfirmation(`revoke:${deviceId}`);
    return;
  }
  profileSessionBusyId = String(deviceId);
  renderProfile();
  try {
    const response = await fetch(`/desktop/account-api/devices/${encodeURIComponent(deviceId)}`, {
      method: "DELETE"
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

async function logoutAllDesktopSessions(confirmed = false) {
  const token = desktopAuthSession()?.token;
  if (!token || profileLogoutAllBusy) return;
  if (!confirmed) {
    requestSettingsConfirmation("logout-all");
    return;
  }
  profileLogoutAllBusy = true;
  renderProfile();
  try {
    const response = await fetch("/desktop/account-api/sessions", { method: "DELETE" });
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
