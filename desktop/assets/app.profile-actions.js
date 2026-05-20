function bindProfileControls() {
  document.querySelectorAll("[data-profile-section]").forEach((button) => button.addEventListener("click", () => setProfileSection(button.dataset.profileSection)));
  document.querySelectorAll("[data-profile-action]").forEach((button) => button.addEventListener("click", () => handleProfileRow(button.dataset.profileAction, button.dataset.profileKey, button)));
  document.querySelectorAll("[data-profile-select]").forEach((select) => select.addEventListener("change", () => setDesktopPreference(select.dataset.profileSelect, select.value)));
}

function setProfileSection(section) {
  if (!profileSections().some((item) => item.key === section)) return;
  profileActiveSection = section;
  localStorage.setItem(profileSectionKey, section);
  renderProfile();
}

function handleProfileRow(action, key, button) {
  if (action === "section") { setProfileSection(button.dataset.profileValue); return; }
  if (action === "open-plans") { openTokenModal("plans"); return; }
  if (action === "manage-billing") { manageDesktopBilling(); return; }
  if (action === "open-pair") { openPairModal(); return; }
  if (action === "mailto") { window.open("mailto:support@vibyra.app?subject=Vibyra%20Desktop%20support", "_blank", "noopener"); return; }
  if (action === "open-url") { window.open(button.dataset.profileValue, "_blank", "noopener"); return; }
  if (action === "clear-cache") { confirmClearDesktopCache(); return; }
  if (action === "save-profile") { saveDesktopProfile(); return; }
  if (action === "load-referral") { loadDesktopReferral(); return; }
  if (action === "copy-referral") { copyDesktopReferralCode(); return; }
  if (action === "share-referral") { openDesktopReferralLink(); return; }
  if (action === "set-pref") { setDesktopPreference(key, button.dataset.profileValue); return; }
  if (action === "toggle-pref") { toggleDesktopPreference(key); return; }
  if (action === "delete-account") { deleteDesktopAccount(); return; }
  if (action === "logout") { if (typeof desktopSignOut === "function") desktopSignOut(); }
}

function saveProfilePreferencesFromForm() {
  const prefs = desktopPreferences();
  const callName = document.getElementById("profile-call-name");
  const workType = document.getElementById("profile-work-type");
  const workOther = document.getElementById("profile-work-other");
  const instructions = document.getElementById("profile-instructions");
  if (callName) prefs.callName = callName.value.trim();
  if (workType) prefs.workType = workType.value;
  if (workOther) prefs.workOther = workOther.value.trim();
  if (instructions) prefs.customInstructions = instructions.value.trim();
  saveDesktopPreferences(prefs);
}

async function saveDesktopProfile() {
  const token = desktopAuthSession()?.token;
  if (!token) { profileFormMessage = "Profile preferences saved. Log in again to update account name or email."; saveProfilePreferencesFromForm(); renderProfile(); return; }
  const name = document.getElementById("profile-name")?.value?.trim() || "";
  const email = document.getElementById("profile-email")?.value?.trim() || "";
  if (!name || !/.+@.+\..+/.test(email)) { profileFormMessage = "Enter a display name and valid email."; renderProfile(); return; }
  saveProfilePreferencesFromForm();
  profileFormBusy = true;
  profileFormMessage = "";
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/account/profile`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, email })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || result?.message || "Could not update profile.");
    if (result.user && typeof storeDesktopAuthSession === "function") storeDesktopAuthSession(token, result.user);
    if (result.user && typeof currentState !== "undefined") currentState = { ...currentState, desktopAccount: result.user };
    profileFormMessage = "Profile updated.";
  } catch (error) {
    profileFormMessage = error instanceof Error ? error.message : "Could not update profile.";
  } finally {
    profileFormBusy = false;
    renderProfile();
  }
}

async function loadDesktopReferral() {
  const token = desktopAuthSession()?.token;
  if (!token) { profileReferralError = "Log in again to load your invite code."; renderProfile(); return; }
  profileReferralLoading = true;
  profileReferralError = "";
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/referrals/me`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || !result?.referral) throw new Error(result?.error || result?.message || "Could not load your invite code.");
    profileReferral = result.referral;
  } catch (error) {
    profileReferralError = error instanceof Error ? error.message : "Could not load your invite code.";
  } finally {
    profileReferralLoading = false;
    renderProfile();
  }
}

async function copyDesktopReferralCode() {
  if (!profileReferral?.code) return;
  try { await navigator.clipboard.writeText(profileReferral.code); } catch {}
  profileCopiedCode = true;
  renderProfile();
  setTimeout(() => { profileCopiedCode = false; renderProfile(); }, 1400);
}

function openDesktopReferralLink() {
  if (profileReferral?.link) window.open(profileReferral.link, "_blank", "noopener");
}

function setDesktopPreference(key, value) {
  const prefs = desktopPreferences();
  if (key === "appearance") prefs.appearance = value;
  if (key === "language") prefs.language = value;
  if (key === "chatFont") prefs.chatFont = value;
  saveDesktopPreferences(prefs);
  renderProfile();
}

function toggleDesktopPreference(key) {
  const prefs = desktopPreferences();
  if (key.startsWith("notifications.")) {
    const item = key.split(".")[1];
    prefs.notifications[item] = !prefs.notifications[item];
  } else {
    prefs[key] = !prefs[key];
  }
  saveDesktopPreferences(prefs);
  renderProfile();
}

async function deleteDesktopAccount() {
  const token = desktopAuthSession()?.token;
  const confirmation = document.getElementById("profile-delete-confirm")?.value?.trim().toUpperCase() || "";
  const password = document.getElementById("profile-delete-password")?.value || "";
  if (confirmation !== "DELETE" || !password) { profileDeleteMessage = "Type DELETE and enter your password."; renderProfile(); return; }
  if (!token) { profileDeleteMessage = "Log in again to delete this account."; renderProfile(); return; }
  profileDeleteBusy = true;
  profileDeleteMessage = "";
  let deleted = false;
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/account`, {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || result?.message || "Could not delete account.");
    deleted = true;
    if (typeof desktopSignOut === "function") desktopSignOut();
  } catch (error) {
    profileDeleteMessage = error instanceof Error ? error.message : "Could not delete account.";
  } finally {
    profileDeleteBusy = false;
    if (!deleted) renderProfile();
  }
}

function confirmClearDesktopCache() {
  const ok = window.confirm("Clear local Vibyra cache? This removes desktop chat history, drafts, project state, terminal sessions, and UI preferences on this computer. Your account stays signed in.");
  if (!ok) return;
  const keep = new Set(["vibyra.desktop.auth", "vibyra.desktop.install", "vibyra.api.url"]);
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("vibyra.desktop.") && !keep.has(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  recentChats = [];
  activeChatId = "";
  chatMessages = [];
  chatDraft = "";
  chatAttachments = [];
  profileReferral = null;
  render();
}
