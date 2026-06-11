function bindProfileControls(root = profileRenderTarget() || document) {
  bindCustomSelects(root);
  root.querySelectorAll("[data-profile-section]").forEach((button) => button.addEventListener("click", () => setProfileSection(button.dataset.profileSection)));
  root.querySelectorAll("[data-profile-action]").forEach((button) => button.addEventListener("click", () => handleProfileRow(button.dataset.profileAction, button.dataset.profileKey, button)));
  root.querySelectorAll("[data-billing-plan]").forEach((button) => button.addEventListener("click", () => startDesktopBilling(button.dataset.billingPlan)));
  root.querySelectorAll("[data-profile-select]").forEach((select) => select.addEventListener("change", () => setDesktopPreference(select.dataset.profileSelect, select.value)));
  bindPlanPickerControls(root);
  bindProfileAppearanceImages(root);
  root.querySelector("#profile-section-search")?.addEventListener("input", (event) => updateProfileSectionSearch(event.target.value));
  root.querySelectorAll("[data-device-menu]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); profileSessionMenuId = profileSessionMenuId === button.dataset.deviceMenu ? "" : button.dataset.deviceMenu; renderProfile(); }));
  root.querySelectorAll("[data-device-revoke]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); revokeDesktopDevice(button.dataset.deviceRevoke); }));
}
function bindProfileAppearanceImages(root = profileRenderTarget() || document) {
  root.querySelectorAll("[data-profile-appearance-image]").forEach((image) => {
    const preview = image.closest(".profile-appearance-preview");
    const showFallback = () => {
      image.hidden = true;
      preview?.classList.add("is-fallback");
    };
    if (image.complete && image.naturalWidth === 0) {
      showFallback();
      return;
    }
    image.addEventListener("error", showFallback, { once: true });
  });
}
function updateProfileSectionSearch(value) {
  profileSectionSearch = String(value || "");
  const query = profileSectionSearch.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll("[data-profile-section-label]").forEach((button) => {
    const visible = !query || String(button.dataset.profileSectionLabel || "").includes(query);
    button.classList.toggle("is-hidden", !visible);
    shown += visible ? 1 : 0;
  });
  document.querySelector(".profile-section-empty")?.classList.toggle("is-visible", shown === 0);
}
function setProfileSection(section) {
  if (!profileSections().some((item) => item.key === section)) return;
  if (section !== "billing") profileBillingPlanOpen = false;
  profileActiveSection = section;
  localStorage.setItem(profileSectionKey, section);
  renderProfile();
  if (typeof resetProfileModalScroll === "function") { resetProfileModalScroll(); requestAnimationFrame(() => resetProfileModalScroll()); }
}
function handleProfileRow(action, key, button) {
  if (action === "section") { setProfileSection(button.dataset.profileValue); return; }
  if (action === "open-plans") { showProfilePlanPicker(); return; }
  if (action === "manage-billing") { manageDesktopBilling(); return; }
  if (action === "change-membership") { showProfilePlanPicker(); return; }
  if (action === "close-plans") { hideProfilePlanPicker(); return; }
  if (action === "show-membership-management") { showMembershipManagement(); return; }
  if (action === "hide-membership-management") { hideMembershipManagement(); return; }
  if (action === "show-billing-cancel") { showBillingCancellation(); return; }
  if (action === "hide-billing-cancel") { hideBillingCancellation(); return; }
  if (action === "submit-billing-cancel") { submitBillingCancellation(); return; }
  if (action === "open-pair") { openPairModal(); return; }
  if (action === "mailto") { window.open("mailto:support@vibyra.app?subject=Vibyra%20Desktop%20support", "_blank", "noopener"); return; }
  if (action === "open-url") { window.open(button.dataset.profileValue, "_blank", "noopener"); return; }
  if (action === "clear-cache") { confirmClearDesktopCache(); return; }
  if (action === "change-screenshot-folder") { void chooseProfileScreenshotDirectory(); return; }
  if (action === "reset-screenshot-folder") { void resetProfileScreenshotDirectory(); return; }
  if (action === "save-profile") { saveDesktopProfile(); return; }
  if (action === "load-referral") { loadDesktopReferral(); return; }
  if (action === "copy-referral") { copyDesktopReferralCode(); return; }
  if (action === "share-referral") { openDesktopReferralLink(); return; }
  if (action === "reload-sessions") { loadDesktopSessions(true); return; }
  if (action === "logout-all") { logoutAllDesktopSessions(); return; }
  if (action === "show-delete-account") { profileDeleteOpen = true; profileDeleteMessage = ""; renderProfile(); requestAnimationFrame(() => document.querySelector(".profile-delete-confirm")?.scrollIntoView({ block: "nearest" })); return; }
  if (action === "hide-delete-account") { profileDeleteOpen = false; profileDeleteMessage = ""; renderProfile(); return; }
  if (action === "set-pref") { setDesktopPreference(key, button.dataset.profileValue); return; }
  if (action === "adjust-voice-speed") { adjustDesktopVoiceSpeed(button.dataset.profileValue); return; }
  if (action === "toggle-pref") { toggleDesktopPreference(key); return; }
  if (action === "delete-account") { deleteDesktopAccount(); return; }
  if (action === "logout") { if (typeof desktopSignOut === "function") desktopSignOut(); }
}
function saveProfilePreferencesFromForm() {
  const prefs = desktopPreferences();
  const callName = document.getElementById("profile-call-name"), responseStyle = document.getElementById("profile-response-style"), workType = document.getElementById("profile-work-type"), workOther = document.getElementById("profile-work-other"), instructions = document.getElementById("profile-instructions");
  if (callName) prefs.callName = callName.value.trim();
  if (responseStyle) prefs.responseStyle = responseStyle.value;
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
      headers: await desktopAccountHeaders(token, { "Content-Type": "application/json" }),
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
    const response = await fetch(`${appApiBaseUrl()}/api/referrals/me`, { headers: await desktopAccountHeaders(token) });
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
function openDesktopReferralLink() { if (profileReferral?.link) window.open(profileReferral.link, "_blank", "noopener"); }
function setDesktopPreference(key, value) {
  const prefs = desktopPreferences();
  if (key === "appearance") prefs.appearance = value;
  if (key === "language") prefs.language = value;
  if (key === "chatFont") prefs.chatFont = value;
  setDesktopVoicePreference(prefs, key, value);
  saveDesktopPreferences(prefs);
  syncProfilePreferenceControls(key, prefs);
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
  syncProfilePreferenceControls(key, prefs);
}
async function deleteDesktopAccount() {
  const token = desktopAuthSession()?.token;
  const password = document.getElementById("profile-delete-password")?.value || "";
  if (!password) { profileDeleteMessage = "Enter your password to delete this account."; renderProfile(); return; }
  if (!token) { profileDeleteMessage = "Log in again to delete this account."; renderProfile(); return; }
  profileDeleteBusy = true;
  profileDeleteMessage = "";
  let deleted = false;
  renderProfile();
  try {
    const response = await fetch(`${appApiBaseUrl()}/api/account`, {
      method: "DELETE",
      headers: await desktopAccountHeaders(token, { "Content-Type": "application/json" }),
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
    Object.keys(localStorage).filter((k) => k.startsWith("vibyra.desktop.") && !keep.has(k)).forEach((k) => localStorage.removeItem(k));
  } catch {}
  recentChats = [];
  activeChatId = "";
  chatMessages = [];
  chatDraft = "";
  chatAttachments = [];
  chatImageAttachments = [];
  profileReferral = null; render();
}
