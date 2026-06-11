function settingsHeader(title, body = "") {
  return `<header class="profile-detail-head"><h1>${escapeHtml(title)}</h1>${body ? `<span>${escapeHtml(body)}</span>` : ""}</header>`;
}

function profileHeader(kicker, title, body = "") {
  return settingsHeader(title, body);
}

function settingsProfileSection(meta) {
  const provider = String(meta.account.provider || "email").toLowerCase();
  const providerEmail = provider !== "email";
  return `${settingsHeader("Profile", "Manage the identity connected to your Vibyra account.")}
    <section class="profile-identity-panel profile-identity-panel--editor">${profileAvatar(meta)}
      <div class="profile-identity-copy"><h2>${escapeHtml(meta.name)}</h2>
      ${meta.email ? `<p>${escapeHtml(meta.email)}</p>` : ""}<span>${escapeHtml(meta.planLabel)}</span></div>
    </section>
    <section class="profile-form profile-form--general" aria-label="Account profile">
      <h2>Account details</h2>
      <label class="profile-field"><span>Full name</span><input id="profile-name" type="text"
        value="${escapeAttribute(meta.name === "Desktop account" ? "" : meta.name)}" autocomplete="name" /></label>
      <label class="profile-field"><span>Email</span><input id="profile-email" type="email"
        value="${escapeAttribute(meta.email)}" autocomplete="email" ${providerEmail ? "readonly" : ""} /></label>
      ${providerEmail ? `<p class="profile-field-note">Email changes are managed by ${escapeHtml(provider === "apple" ? "Apple" : "Google")}.</p>` : ""}
      <div class="profile-inline-actions"><button class="primary-button compact-button" type="button"
        data-profile-action="save-profile" ${profileFormBusy ? "disabled" : ""}>${profileFormBusy ? "Saving..." : "Save account"}</button>
        ${profileFormMessage ? `<p class="profile-status" role="status" aria-live="polite">${escapeHtml(profileFormMessage)}</p>` : ""}</div>
    </section>
    <section class="profile-account-actions"><h2>Delete account</h2>
      <p class="profile-section-copy">Permanently remove this account, synced data, and active sessions.</p>
      <button class="profile-account-action profile-account-action--danger${profileDeleteOpen ? " is-open" : ""}"
        type="button" data-profile-action="${profileDeleteOpen ? "hide-delete-account" : "show-delete-account"}"
        aria-expanded="${profileDeleteOpen}"><span>Delete account</span>${icon("chevron")}</button>
      ${renderDeleteAccountPanel(meta)}
    </section>`;
}

function settingsPersonalizationSection(meta) {
  const prefs = desktopPreferences();
  const otherHidden = prefs.workType !== "other";
  return `${settingsHeader("Personalization", "Choose how Vibyra addresses you and responds to your work.")}
    <section class="profile-form profile-form--general" aria-label="Vibyra personalization">
      <label class="profile-field"><span>Preferred name</span><input id="profile-call-name" type="text"
        value="${escapeAttribute(prefs.callName || firstName(meta.name))}" autocomplete="nickname" /></label>
      ${profileSelectField("Your work", "profile-work-type", profileWorkOptions, prefs.workType)}
      <label class="profile-field" data-profile-work-other ${otherHidden ? "hidden" : ""}><span>Describe your work</span>
        <input id="profile-work-other" type="text" value="${escapeAttribute(prefs.workOther || "")}" /></label>
      ${profileSelectField("Response style", "profile-response-style", profileResponseStyleOptions, prefs.responseStyle)}
      <label class="profile-field profile-field--wide"><span>Instructions</span>
        <textarea id="profile-instructions" rows="4" placeholder="Add preferences Vibyra should follow">${escapeHtml(prefs.customInstructions || "")}</textarea></label>
      <div class="profile-inline-actions"><button class="primary-button compact-button" type="button"
        data-profile-action="save-personalization">Save personalization</button>
        <p class="profile-status" data-personalization-status role="status" aria-live="polite"></p></div>
    </section>`;
}

function settingsAppSection() {
  const prefs = desktopPreferences();
  return `${settingsHeader("App", "Adjust this desktop without changing your account on other devices.")}
    ${renderAppearancePanel(prefs.appearance)}
    ${profileScreenshotSettingsPanel()}
    <section class="profile-choice-list profile-settings-list"><h2>Chat</h2>
      ${profileSelectRow("Chat font", "chatFont", profileChatFontOptions, prefs.chatFont)}
    </section>
    ${profileVoiceSettingsPanel(prefs)}`;
}

function settingsDevicesSection(meta) {
  const paired = Boolean(currentState.pairedDevice);
  return `${settingsHeader("Devices & privacy", "Review signed-in devices and data stored on this computer.")}
    ${renderProfileSessionsPanel()}
    <section class="profile-choice-list"><h2>This computer</h2>${profileActionList([
      { key: "desktop", icon: "desktop", label: currentState.machineName || "Vibyra Desktop", detail: "Local bridge running on this computer.", action: "" },
      { key: "companion", icon: "phone", label: paired ? "Companion connected" : "Pair companion device", detail: paired ? currentState.pairedDevice : "Connect a phone using a one-time pairing code.", action: "open-pair" }
    ])}</section>
    <section class="profile-choice-list"><h2>Local data</h2>${profileActionList([
      { key: "clear", icon: "trash", label: "Clear local cache", detail: "Remove local chats, drafts, project state, and interface preferences.", action: "clear-cache", danger: true },
      { key: "privacy-policy", icon: "lock", label: "Privacy policy", detail: "Read how Vibyra handles account and device data.", action: "open-url", value: "https://vibyra.app/legal/privacy" }
    ])}</section>
    <section class="profile-account-actions"><h2>Sessions</h2>
      <button class="profile-account-action" type="button" data-profile-action="logout-all"
        ${profileLogoutAllBusy ? "disabled" : ""}><span>${profileLogoutAllBusy ? "Logging out..." : "Log out everywhere"}</span>${icon("chevron")}</button>
    </section>${renderSettingsConfirmation()}`;
}

function settingsHelpSection() {
  return `${settingsHeader("Help", "Get support or review Vibyra's policies.")}
    ${profileActionList([
      { key: "contact", icon: "send", label: "Contact support", detail: "Email support@vibyra.app.", action: "mailto" },
      { key: "terms", icon: "document", label: "Terms of service", detail: "Review the terms for using Vibyra.", action: "open-url", value: "https://vibyra.app/legal/terms" },
      { key: "privacy", icon: "lock", label: "Privacy policy", detail: "Review Vibyra's privacy policy.", action: "open-url", value: "https://vibyra.app/legal/privacy" }
    ])}`;
}
