let profileScreenshotSettings = null;
let profileScreenshotSettingsBusy = false;
let profileScreenshotSettingsError = "";

function profileScreenshotSettingsPanel() {
  const state = profileScreenshotSettings;
  const detail = profileScreenshotSettingsBusy
    ? "Opening folder picker..."
    : state?.directory || "Loading screenshot folder...";
  const rows = [{
    key: "screenshot-folder",
    icon: "folder",
    label: "Screenshot folder",
    detail,
    action: "change-screenshot-folder",
    disabled: profileScreenshotSettingsBusy
  }];
  if (state?.isCustom) {
    rows.push({
      key: "screenshot-folder-reset",
      icon: "refresh",
      label: "Use default folder",
      detail: state.defaultDirectory,
      action: "reset-screenshot-folder",
      disabled: profileScreenshotSettingsBusy
    });
  }
  return `<section class="profile-choice-list"><h2>Screenshots</h2>${profileActionList(rows)}${profileScreenshotSettingsError ? `<p class="profile-status profile-status--danger">${escapeHtml(profileScreenshotSettingsError)}</p>` : ""}</section>`;
}

async function ensureProfileScreenshotSettings() {
  if (profileScreenshotSettings || profileScreenshotSettingsBusy) return;
  const api = window.vibyraDesktopScreenshot;
  if (!api?.getSettings) return;
  profileScreenshotSettingsBusy = true;
  try {
    const result = await api.getSettings();
    if (!result?.ok) throw new Error(result?.error || "Screenshot folder could not be loaded.");
    profileScreenshotSettings = result;
    profileScreenshotSettingsError = "";
  } catch (error) {
    profileScreenshotSettingsError = error instanceof Error ? error.message : "Screenshot folder could not be loaded.";
  } finally {
    profileScreenshotSettingsBusy = false;
    if (profileActiveSection === "app") renderProfile();
  }
}

async function chooseProfileScreenshotDirectory() {
  if (profileScreenshotSettingsBusy) return;
  profileScreenshotSettingsBusy = true;
  profileScreenshotSettingsError = "";
  renderProfile();
  try {
    const result = await window.vibyraDesktopScreenshot?.chooseDirectory?.();
    if (!result?.ok) throw new Error(result?.error || "Screenshot folder could not be changed.");
    if (!result.canceled) {
      profileScreenshotSettings = result;
      clearSavedScreenshotTray();
    }
  } catch (error) {
    profileScreenshotSettingsError = error instanceof Error ? error.message : "Screenshot folder could not be changed.";
  } finally {
    profileScreenshotSettingsBusy = false;
    renderProfile();
  }
}

async function resetProfileScreenshotDirectory() {
  if (profileScreenshotSettingsBusy) return;
  profileScreenshotSettingsBusy = true;
  profileScreenshotSettingsError = "";
  renderProfile();
  try {
    const result = await window.vibyraDesktopScreenshot?.resetDirectory?.();
    if (!result?.ok) throw new Error(result?.error || "Screenshot folder could not be reset.");
    profileScreenshotSettings = result;
    clearSavedScreenshotTray();
  } catch (error) {
    profileScreenshotSettingsError = error instanceof Error ? error.message : "Screenshot folder could not be reset.";
  } finally {
    profileScreenshotSettingsBusy = false;
    renderProfile();
  }
}
