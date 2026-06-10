function renderProfile() {
  const target = profileRenderTarget();
  if (!target) return;
  const sections = profileSections();
  if (!sections.some((section) => section.key === profileActiveSection)) profileActiveSection = "general";
  const meta = profileAccountMeta();
  target.innerHTML = `<div class="profile-page profile-page--desktop">
    <aside class="profile-section-rail" aria-label="Profile sections">${renderProfileSectionRail(sections, meta)}</aside>
    <main class="profile-detail">${renderProfileDetail(profileActiveSection, meta)}</main>
  </div>`;
  bindProfileControls(target);
  if (profileActiveSection === "account" && typeof ensureDesktopSessions === "function") ensureDesktopSessions();
  profileFocus = "";
}

function renderProfileModal() { renderProfile(); }

function profileRenderTarget() {
  if (typeof nodes === "undefined") return null;
  if (nodes.profileModal?.classList.contains("open") && nodes.profileBody) return nodes.profileBody;
  return null;
}

function profileHasActiveControl() {
  const active = document.activeElement;
  const target = profileRenderTarget();
  return Boolean(active && target?.contains(active) && active.closest?.(".profile-page") && active.matches?.("input, select, textarea"));
}

function renderProfileSectionRail(sections, meta) {
  const query = String(profileSectionSearch || "").trim().toLowerCase();
  const items = sections.map((section) => {
    const active = section.key === profileActiveSection ? " active" : "";
    const hidden = query && !section.label.toLowerCase().includes(query) ? " is-hidden" : "";
    return `<button class="profile-section-button${active}${hidden}" type="button" data-profile-section="${escapeAttribute(section.key)}" data-profile-section-label="${escapeAttribute(section.label.toLowerCase())}">${icon(section.icon)}<span>${escapeHtml(section.label)}</span></button>`;
  }).join("");
  const hasMatches = sections.some((section) => !query || section.label.toLowerCase().includes(query));
  const noResults = `<p class="profile-section-empty${hasMatches ? "" : " is-visible"}">No matches</p>`;
  return `<div class="profile-section-card">
    <label class="profile-section-search">${icon("search")}<input id="profile-section-search" type="search" value="${escapeAttribute(profileSectionSearch)}" placeholder="Search" autocomplete="off" /></label>
    <div class="profile-section-identity">${profileAvatar(meta, "small")}<div><strong>${escapeHtml(meta.name)}</strong><span>${escapeHtml(meta.planLabel)}</span></div></div>
    <nav class="profile-section-list">${items}</nav>${noResults}
  </div>`;
}

function renderProfileDetail(section, meta) {
  const renderers = {
    account: () => profileAccountSection(meta),
    billing: () => profileBillingSection(meta),
    devices: () => profileDevicesSection(),
    general: () => profileGeneralSection(meta),
    preferences: () => profilePreferencesSection(),
    privacy: () => profilePrivacySection(),
    support: () => profileSupportSection()
  };
  return (renderers[section] || renderers.general)();
}

function profileHeader(kicker, title, body = "") { return `<header class="profile-detail-head">${kicker ? `<p>${escapeHtml(kicker)}</p>` : ""}<h1>${escapeHtml(title)}</h1>${body ? `<span>${escapeHtml(body)}</span>` : ""}</header>`; }

function profileGeneralSection(meta) {
  const prefs = desktopPreferences();
  return `${profileHeader("", "General", "Personalize how Vibyra should work with you on this desktop.")}
    <section class="profile-identity-panel profile-identity-panel--editor">${profileAvatar(meta)}<div class="profile-identity-copy"><h2>${escapeHtml(meta.name)}</h2>${meta.email ? `<p>${escapeHtml(meta.email)}</p>` : ""}<span>${escapeHtml(meta.planLabel)}</span></div></section>
    ${renderProfileForm(meta, prefs)}`;
}

function profileAccountSection(meta) {
  return `${profileHeader("", "Account")}
    ${renderProfileSessionsPanel()}
    ${renderAccountActionsPanel(meta)}`;
}

function renderProfileForm(meta, prefs) {
  return `<section class="profile-form profile-form--general" aria-label="Profile information"><h2>Profile</h2><label class="profile-field"><span>Full name</span><input id="profile-name" type="text" value="${escapeAttribute(meta.name === "Desktop account" ? "" : meta.name)}" placeholder="Your name" autocomplete="name" /></label><label class="profile-field"><span>Email</span><input id="profile-email" type="email" value="${escapeAttribute(meta.email)}" placeholder="you@vibyra.app" autocomplete="email" /></label><label class="profile-field"><span>What should Vibyra call you?</span><input id="profile-call-name" type="text" value="${escapeAttribute(prefs.callName || firstName(meta.name))}" placeholder="Preferred name" autocomplete="nickname" /></label><label class="profile-field"><span>What best describes your work?</span><select id="profile-work-type">${profileWorkOptions.map((item) => `<option value="${escapeAttribute(item.key)}" ${prefs.workType === item.key ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label><label class="profile-field"><span>Preferred response style</span><select id="profile-response-style">${profileResponseStyleOptions.map((item) => `<option value="${escapeAttribute(item.key)}" ${prefs.responseStyle === item.key ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label><label class="profile-field"><span>Other work description</span><input id="profile-work-other" type="text" value="${escapeAttribute(prefs.workOther || "")}" placeholder="Describe your work" /></label><label class="profile-field profile-field--wide"><span>Instructions for Vibyra</span><textarea id="profile-instructions" rows="4" placeholder="e.g. ask clarifying questions before detailed implementation, keep changes small, explain tradeoffs clearly">${escapeHtml(prefs.customInstructions || "")}</textarea></label><div class="profile-inline-actions"><button class="primary-button compact-button" type="button" data-profile-action="save-profile" ${profileFormBusy ? "disabled" : ""}>${profileFormBusy ? "Saving..." : "Save profile"}</button>${profileFormMessage ? `<p class="profile-status">${escapeHtml(profileFormMessage)}</p>` : ""}</div></section>`;
}

function renderReferralPanel() {
  if (profileReferralLoading) return `<section class="profile-referral-panel"><h2>Refer & earn</h2><p>Loading your invite code...</p></section>`;
  if (profileReferral) {
    const stats = profileReferral.stats || {};
    return `<section class="profile-referral-panel"><h2>Refer & earn</h2><div class="profile-referral-code"><strong>${escapeHtml(profileReferral.code || "")}</strong><span>${escapeHtml(profileReferral.link || "")}</span></div><div class="profile-inline-actions"><button class="secondary-button compact-button" type="button" data-profile-action="copy-referral">${profileCopiedCode ? "Copied" : "Copy code"}</button><button class="secondary-button compact-button" type="button" data-profile-action="share-referral">Open invite link</button></div><div class="profile-stat-grid"><span><strong>${escapeHtml(String(stats.signedUp || 0))}</strong>Joined</span><span><strong>${escapeHtml(String(stats.paid || 0))}</strong>Members</span><span><strong>${escapeHtml(String(stats.earnedCredits || 0))}</strong>Earned</span></div></section>`;
  }
  return `<section class="profile-referral-panel"><h2>Refer & earn</h2><p>${escapeHtml(profileReferralError || "Load your invite code and share it from this desktop.")}</p><button class="secondary-button compact-button" type="button" data-profile-action="load-referral">Load invite code</button></section>`;
}

function profileUsageStat(label, used, cap) {
  const value = cap > 0 ? `${Math.min(100, Math.max(0, Math.round((Number(used || 0) / Number(cap)) * 100)))}%` : "No limit";
  return `<span><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>`;
}

function profileDevicesSection() {
  const paired = Boolean(currentState.pairedDevice);
  return `${profileHeader("Devices", "This desktop", "Manage this local desktop bridge and trusted companion connections.")}
    ${profileActionList([
      { key: "desktop", icon: "desktop", label: currentState.machineName || "Vibyra Desktop", detail: "Local bridge running on this computer.", action: "" },
      { key: "companion", icon: "phone", label: paired ? "Companion connected" : "Pair companion device", detail: paired ? currentState.pairedDevice : "Show the pairing code and approve a device you recognize.", action: "open-pair" }
    ])}`;
}

function profilePrivacySection() {
  const prefs = desktopPreferences();
  return `${profileHeader("Privacy", "Privacy & security", "Control local desktop privacy choices and account safety actions.")}
    ${profileInfoPanel("Local data", "Cached desktop chats, drafts, project state, terminal sessions, and UI preferences stay on this computer until cleared.")}
    ${profileToggleList([
      { key: "improveVibyra", label: "Improve Vibyra", detail: "Share anonymous desktop reliability signals when telemetry is available.", value: prefs.improveVibyra },
      { key: "desktopLock", label: "Desktop app lock", detail: "Remember that this desktop should require an OS lock when a native lock flow is available.", value: prefs.desktopLock }
    ])}
    ${profileActionList([
      { key: "privacy-policy", icon: "lock", label: "Privacy policy", detail: "Open Vibyra's privacy policy.", action: "open-url", value: "https://vibyra.app/legal/privacy" },
      { key: "clear", icon: "trash", label: "Clear local cache", detail: "Remove desktop chat history, drafts, project state, terminal sessions, and UI preferences. Your account stays signed in.", action: "clear-cache", danger: true }
    ])}`;
}

function profilePreferencesSection() {
  const prefs = desktopPreferences();
  return `${profileHeader("Preferences", "Preferences", "Desktop preferences are saved locally for this computer.")}
    ${renderAppearancePanel(prefs.appearance)}
    <section class="profile-choice-list profile-settings-list"><h2>Chat</h2>${profileSelectRow("Chat font", "chatFont", profileChatFontOptions, prefs.chatFont)}</section>
    ${profileVoiceSettingsPanel(prefs)}
    <section class="profile-choice-list"><h2>Language</h2>${profileLanguages.map((language) => profileChoiceButton("language", language, language, "Display language preference", "globe", prefs.language === language)).join("")}</section>
    <section class="profile-choice-list"><h2>Notifications</h2>${profileToggleList([
      { key: "notifications.buildUpdates", label: "Build updates", detail: "Agent starts, completions, failures, and queued build changes.", value: prefs.notifications.buildUpdates },
      { key: "notifications.chatReplies", label: "Chat replies", detail: "New assistant replies and important chat activity.", value: prefs.notifications.chatReplies },
      { key: "notifications.productUpdates", label: "Product updates", detail: "Occasional Vibyra feature, credit, and membership updates.", value: prefs.notifications.productUpdates }
    ])}</section>`;
}

function profileSupportSection() {
  return `${profileHeader("Support", "Support", "Help, contact, and legal links for this desktop session.")}
    <section class="profile-faq-list">${profileFaqs.map((item) => `<article><h2>${escapeHtml(item.q)}</h2><p>${escapeHtml(item.a)}</p></article>`).join("")}</section>
    ${profileActionList([
      { key: "contact", icon: "send", label: "Contact support", detail: "Email Vibyra support.", action: "mailto" },
      { key: "terms", icon: "document", label: "Terms of service", detail: "Open terms and privacy policies.", action: "open-url", value: "https://vibyra.app/legal/terms" },
      { key: "privacy", icon: "lock", label: "Privacy policy", detail: "Open privacy policy.", action: "open-url", value: "https://vibyra.app/legal/privacy" }
    ])}`;
}

function profileInfoPanel(title, detail) { return `<section class="profile-info-panel"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></section>`; }

function renderAppearancePanel(value) { return `<section class="profile-choice-list profile-appearance-section"><h2>Appearance</h2>${renderAppearancePicker(value)}</section>`; }

function renderAppearancePicker(value) {
  const previews = [
    { key: "dark", title: "Dark mode", image: "/desktop/assets/profile-appearance-dark.png" },
    { key: "light", title: "Light mode", image: "/desktop/assets/profile-appearance-light.png" },
    { key: "auto", title: "System", image: "/desktop/assets/profile-appearance-auto.png" }
  ];
  return `<div class="profile-appearance-grid">${previews.map((item) => {
    const active = value === item.key;
    return `<button class="profile-appearance-card${active ? " active" : ""}" type="button" data-profile-action="set-pref" data-profile-key="appearance" data-profile-value="${escapeAttribute(item.key)}" aria-pressed="${active ? "true" : "false"}" aria-label="${escapeAttribute(item.title)}"><span class="profile-appearance-preview profile-appearance-preview--${escapeAttribute(item.key)}"><img src="${escapeAttribute(item.image)}" alt="" loading="eager" decoding="async" fetchpriority="high" data-profile-appearance-image /></span><strong>${escapeHtml(item.title)}</strong>${active ? `<span class="profile-appearance-check">${icon("check")}</span>` : ""}</button>`;
  }).join("")}</div>`;
}

function profileChoiceButton(group, value, title, detail, iconName, active) { return `<button class="profile-choice-row${active ? " active" : ""}" type="button" data-profile-action="set-pref" data-profile-key="${escapeAttribute(group)}" data-profile-value="${escapeAttribute(value)}"><span class="profile-row-icon">${icon(iconName)}</span><span class="profile-action-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span><span class="profile-choice-check">${active ? icon("check") : ""}</span></button>`; }

function profileToggleList(rows) { return rows.map((row) => `<button class="profile-toggle-row${row.value ? " is-on" : ""}" type="button" data-profile-action="toggle-pref" data-profile-key="${escapeAttribute(row.key)}"><span class="profile-toggle"><span></span></span><span class="profile-action-copy"><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span></button>`).join(""); }

function profileSelectRow(label, key, options, value) { return `<label class="profile-select-row"><span>${escapeHtml(label)}</span><select data-profile-select="${escapeAttribute(key)}">${options.map((item) => `<option value="${escapeAttribute(item.key)}" ${value === item.key ? "selected" : ""}>${escapeHtml(item.label || item.title)}</option>`).join("")}</select></label>`; }

function firstName(name) {
  const value = String(name || "").trim().split(/\s+/).filter(Boolean)[0];
  return value && value !== "Desktop" ? value : "";
}

function profileInfoTile(label, value, detail, section) { return `<button class="profile-info-tile" type="button" data-profile-section="${escapeAttribute(section)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></button>`; }

function profileActionList(rows) { return `<section class="profile-action-list">${rows.map(profileActionRow).join("")}</section>`; }

function profileActionRow(row) {
  const right = row.action ? `<span class="profile-row-chevron">${icon("chevron")}</span>` : "";
  const cls = `profile-action-row${row.danger ? " profile-action-row--danger" : ""}${row.action ? "" : " profile-action-row--static"}`;
  const action = row.action ? ` data-profile-action="${escapeAttribute(row.action)}"` : "";
  const value = row.value ? ` data-profile-value="${escapeAttribute(row.value)}"` : "";
  const disabled = row.disabled ? " disabled" : "";
  return `<button class="${cls}" type="button"${action} data-profile-key="${escapeAttribute(row.key)}"${value}${disabled}><span class="profile-row-icon">${icon(row.icon)}</span><span class="profile-action-copy"><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail || "")}</small></span>${right}</button>`;
}
