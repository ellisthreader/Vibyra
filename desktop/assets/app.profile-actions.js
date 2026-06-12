function bindProfileControls(root = profileRenderTarget() || document) {
  bindCustomSelects(root);
  bindPlanPickerControls(root);
  bindProfileAppearanceImages(root);
  if (root.dataset.profileDelegated === "true") return;
  root.dataset.profileDelegated = "true";
  root.addEventListener("click", handleProfileClick);
  root.addEventListener("change", handleProfileChange);
  root.addEventListener("keydown", handleProfileKeydown);
}
function handleProfileClick(event) {
  const button = event.target.closest("button");
  if (!button || !event.currentTarget.contains(button)) return;
  if (button.dataset.profileSection) { setProfileSection(button.dataset.profileSection); return; }
  if (button.dataset.deviceMenu) {
    event.stopPropagation();
    profileSessionMenuId = profileSessionMenuId === button.dataset.deviceMenu ? "" : button.dataset.deviceMenu;
    renderProfile();
    return;
  }
  if (button.dataset.deviceRevoke) {
    event.stopPropagation();
    revokeDesktopDevice(button.dataset.deviceRevoke);
    return;
  }
  if (button.dataset.billingPlan) { startDesktopBilling(button.dataset.billingPlan); return; }
  if (button.dataset.profileAction) {
    handleProfileRow(button.dataset.profileAction, button.dataset.profileKey, button);
    return;
  }
  if (profileSessionMenuId && !button.closest(".profile-session-actions")) {
    profileSessionMenuId = "";
    renderProfile();
  }
}
function handleProfileChange(event) {
  const control = event.target;
  if (control.dataset.profileSelect) setDesktopPreference(control.dataset.profileSelect, control.value);
  if (control.id === "profile-work-type") {
    document.querySelector("[data-profile-work-other]")?.toggleAttribute("hidden", control.value !== "other");
  }
}
function handleProfileKeydown(event) {
  if (event.key !== "Escape" || !profileSessionMenuId) return;
  event.preventDefault();
  event.stopPropagation();
  profileSessionMenuId = "";
  renderProfile();
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
  if (action === "ai-account-login") { void changeProfileAiAccount(button.dataset.aiProvider, "login"); return; }
  if (action === "ai-account-cancel") { void changeProfileAiAccount(button.dataset.aiProvider, "cancel"); return; }
  if (action === "ai-account-disconnect") { void changeProfileAiAccount(button.dataset.aiProvider, "disconnect"); return; }
  if (action === "ai-account-open-url") { window.open(button.dataset.profileValue, "_blank", "noopener"); return; }
  if (action === "mailto") { window.open("mailto:support@vibyra.app?subject=Vibyra%20Desktop%20support", "_blank", "noopener"); return; }
  if (action === "open-url") { window.open(button.dataset.profileValue, "_blank", "noopener"); return; }
  if (action === "clear-cache") { requestSettingsConfirmation("clear-cache"); return; }
  if (action === "change-screenshot-folder") { void chooseProfileScreenshotDirectory(); return; }
  if (action === "reset-screenshot-folder") { void resetProfileScreenshotDirectory(); return; }
  if (action === "save-profile") { saveDesktopProfile(); return; }
  if (action === "save-personalization") { saveDesktopPersonalization(); return; }
  if (action === "reload-sessions") { loadDesktopSessions(true); return; }
  if (action === "logout-all") { requestSettingsConfirmation("logout-all"); return; }
  if (action === "confirm-settings-action") { confirmSettingsAction(); return; }
  if (action === "cancel-settings-action") { cancelSettingsConfirmation(); return; }
  if (action === "show-delete-account") { profileDeleteOpen = true; profileDeleteMessage = ""; renderProfile(); requestAnimationFrame(() => document.querySelector(".profile-delete-confirm")?.scrollIntoView({ block: "nearest" })); return; }
  if (action === "hide-delete-account") { profileDeleteOpen = false; profileDeleteMessage = ""; renderProfile(); return; }
  if (action === "set-pref") { setDesktopPreference(key, button.dataset.profileValue); return; }
  if (action === "adjust-voice-speed") { adjustDesktopVoiceSpeed(button.dataset.profileValue); return; }
  if (action === "delete-account") { deleteDesktopAccount(); return; }
  if (action === "logout") { if (typeof desktopSignOut === "function") desktopSignOut(); }
}
async function saveDesktopProfile() {
  const token = desktopAuthSession()?.token;
  if (!token) { profileFormMessage = "Log in again to update your account."; renderProfile(); return; }
  const name = document.getElementById("profile-name")?.value?.trim() || "";
  const email = document.getElementById("profile-email")?.value?.trim() || "";
  if (!name || !/.+@.+\..+/.test(email)) { profileFormMessage = "Enter a display name and valid email."; renderProfile(); return; }
  profileFormBusy = true;
  profileFormMessage = "";
  renderProfile();
  try {
    const response = await fetch("/desktop/account-api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
function setDesktopPreference(key, value) {
  const prefs = desktopPreferences();
  if (key === "appearance") prefs.appearance = value;
  if (key === "chatFont") prefs.chatFont = value;
  if (key === "language" && profileLanguageOptions.some((item) => item.key === value)) prefs.language = value;
  setDesktopVoicePreference(prefs, key, value);
  saveDesktopPreferences(prefs);
  syncProfilePreferenceControls(key, prefs);
}
async function deleteDesktopAccount() {
  const token = desktopAuthSession()?.token;
  const provider = String(currentAccount().provider || "email").toLowerCase();
  if (!token) { profileDeleteMessage = "Log in again to delete this account."; renderProfile(); return; }
  if (provider === "apple" || provider === "google") {
    await deleteDesktopProviderAccount(provider);
    return;
  }
  const password = document.getElementById("profile-delete-password")?.value || "";
  if (!password) { profileDeleteMessage = "Enter your password to delete this account."; renderProfile(); return; }
  profileDeleteBusy = true;
  profileDeleteMessage = "";
  let deleted = false;
  renderProfile();
  try {
    const response = await fetch("/desktop/account-api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
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
