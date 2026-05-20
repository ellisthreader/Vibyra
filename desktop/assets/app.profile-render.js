function renderProfile() {
  if (!nodes.content) return;
  const sections = profileSections();
  if (!sections.some((section) => section.key === profileActiveSection)) profileActiveSection = "general";
  const meta = profileAccountMeta();
  nodes.content.innerHTML = `<div class="profile-page profile-page--desktop">
    <aside class="profile-section-rail" aria-label="Profile sections">${renderProfileSectionRail(sections, meta)}</aside>
    <main class="profile-detail">${renderProfileDetail(profileActiveSection, meta)}</main>
  </div>`;
  bindProfileControls();
  profileFocus = "";
}

function renderProfileSectionRail(sections, meta) {
  const items = sections.map((section) => {
    const active = section.key === profileActiveSection ? " active" : "";
    return `<button class="profile-section-button${active}" type="button" data-profile-section="${escapeAttribute(section.key)}">${icon(section.icon)}<span>${escapeHtml(section.label)}</span></button>`;
  }).join("");
  return `<div class="profile-section-card">
    <h2 class="profile-section-title">Settings</h2>
    <div class="profile-section-identity">${profileAvatar(meta, "small")}<div><strong>${escapeHtml(meta.name)}</strong><span>${escapeHtml(meta.planLabel)}</span></div></div>
    <nav class="profile-section-list">${items}</nav>
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
    support: () => profileSupportSection(),
    usage: () => profileUsageSection(meta)
  };
  return (renderers[section] || renderers.general)();
}

function profileHeader(kicker, title, body = "") {
  return `<header class="profile-detail-head"><p>${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1>${body ? `<span>${escapeHtml(body)}</span>` : ""}</header>`;
}

function profileGeneralSection(meta) {
  const prefs = desktopPreferences();
  return `${profileHeader("Vibyra Profile", "General", "Personalize how Vibyra should work with you on this desktop.")}
    <section class="profile-identity-panel profile-identity-panel--editor">${profileAvatar(meta)}<div class="profile-identity-copy"><h2>${escapeHtml(meta.name)}</h2>${meta.email ? `<p>${escapeHtml(meta.email)}</p>` : ""}<span>${escapeHtml(meta.planLabel)}</span></div></section>
    ${renderProfileForm(meta, prefs)}
    ${renderGeneralPreferences(prefs)}`;
}

function profileAccountSection(meta) {
  return `${profileHeader("Account", "Account details", "Changes saved here carry across your Vibyra account where the backend supports them.")}
    ${renderProfileForm(meta, desktopPreferences())}
    ${renderReferralPanel()}
    ${profileActionList([{ key: "logout", icon: "logout", label: "Log out", detail: "End this local desktop session.", action: "logout", danger: true }])}
    ${renderDeleteAccountPanel(meta)}`;
}

function renderProfileForm(meta, prefs) {
  return `<section class="profile-form profile-form--general" aria-label="Profile information"><h2>Profile</h2><label class="profile-field"><span>Full name</span><input id="profile-name" type="text" value="${escapeAttribute(meta.name === "Desktop account" ? "" : meta.name)}" placeholder="Your name" autocomplete="name" /></label><label class="profile-field"><span>Email</span><input id="profile-email" type="email" value="${escapeAttribute(meta.email)}" placeholder="you@vibyra.app" autocomplete="email" /></label><label class="profile-field"><span>What should Vibyra call you?</span><input id="profile-call-name" type="text" value="${escapeAttribute(prefs.callName || firstName(meta.name))}" placeholder="Preferred name" autocomplete="nickname" /></label><label class="profile-field"><span>What best describes your work?</span><select id="profile-work-type">${profileWorkOptions.map((item) => `<option value="${escapeAttribute(item.key)}" ${prefs.workType === item.key ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select></label><label class="profile-field"><span>Other work description</span><input id="profile-work-other" type="text" value="${escapeAttribute(prefs.workOther || "")}" placeholder="Describe your work" /></label><label class="profile-field profile-field--wide"><span>Instructions for Vibyra</span><textarea id="profile-instructions" rows="4" placeholder="e.g. ask clarifying questions before detailed implementation, keep changes small, explain tradeoffs clearly">${escapeHtml(prefs.customInstructions || "")}</textarea></label><div class="profile-inline-actions"><button class="primary-button compact-button" type="button" data-profile-action="save-profile" ${profileFormBusy ? "disabled" : ""}>${profileFormBusy ? "Saving..." : "Save profile"}</button>${profileFormMessage ? `<p class="profile-status">${escapeHtml(profileFormMessage)}</p>` : ""}</div></section>`;
}

function renderGeneralPreferences(prefs) {
  return `<section class="profile-choice-list profile-settings-list"><h2>Preferences</h2>${profileSelectRow("Appearance", "appearance", profileAppearanceOptions, prefs.appearance)}${profileSelectRow("Chat font", "chatFont", profileChatFontOptions, prefs.chatFont)}</section>`;
}

function renderReferralPanel() {
  if (profileReferralLoading) return `<section class="profile-referral-panel"><h2>Refer & earn</h2><p>Loading your invite code...</p></section>`;
  if (profileReferral) {
    const stats = profileReferral.stats || {};
    return `<section class="profile-referral-panel"><h2>Refer & earn</h2><div class="profile-referral-code"><strong>${escapeHtml(profileReferral.code || "")}</strong><span>${escapeHtml(profileReferral.link || "")}</span></div><div class="profile-inline-actions"><button class="secondary-button compact-button" type="button" data-profile-action="copy-referral">${profileCopiedCode ? "Copied" : "Copy code"}</button><button class="secondary-button compact-button" type="button" data-profile-action="share-referral">Open invite link</button></div><div class="profile-stat-grid"><span><strong>${escapeHtml(String(stats.signedUp || 0))}</strong>Joined</span><span><strong>${escapeHtml(String(stats.paid || 0))}</strong>Members</span><span><strong>${escapeHtml(String(stats.earnedCredits || 0))}</strong>Earned</span></div></section>`;
  }
  return `<section class="profile-referral-panel"><h2>Refer & earn</h2><p>${escapeHtml(profileReferralError || "Load your invite code and share it from this desktop.")}</p><button class="secondary-button compact-button" type="button" data-profile-action="load-referral">Load invite code</button></section>`;
}

function renderDeleteAccountPanel(meta) {
  return `<section class="profile-danger-panel"><h2>Delete account</h2><p>This permanently deletes ${escapeHtml(meta.email || "your Vibyra account")}, including synced Vibyra app data. Manage any active membership before deleting.</p><label class="profile-field"><span>Type DELETE to confirm</span><input id="profile-delete-confirm" type="text" autocomplete="off" /></label><label class="profile-field"><span>Password</span><input id="profile-delete-password" type="password" autocomplete="current-password" /></label><div class="profile-inline-actions"><button class="danger-button compact-button" type="button" data-profile-action="delete-account" ${profileDeleteBusy ? "disabled" : ""}>${profileDeleteBusy ? "Deleting..." : "Delete account"}</button>${profileDeleteMessage ? `<p class="profile-status profile-status--danger">${escapeHtml(profileDeleteMessage)}</p>` : ""}</div></section>`;
}

function profileBillingSection(meta) {
  const price = meta.cycle === "annual" && meta.tier.annualPrice ? meta.tier.annualPrice : meta.tier.price;
  const currentAction = meta.tier.key === "free" ? "Upgrade plan" : "Manage billing";
  const planAction = meta.tier.key === "free" ? "open-plans" : "manage-billing";
  return `${profileHeader("Billing", "Membership", "Plan details stay compact here; checkout and plan management open through the desktop billing flow.")}
    <section class="profile-plan-panel"><div><span>Current plan</span><h2>${escapeHtml(meta.planLabel)}</h2><p>${escapeHtml(price || "£0")} · ${formatCredits(meta.allowance)} monthly credits</p></div><button class="primary-button compact-button" type="button" data-profile-action="${planAction}" data-profile-key="plan">${escapeHtml(currentAction)}</button></section>
    ${profileActionList([
      { key: "plan", icon: "card", label: "Plan & billing", detail: "Compare available Vibyra plans or manage your membership.", action: planAction },
      { key: "usage", icon: "pulse", label: "Usage", detail: "Review account credits and limits.", action: "section", value: "usage" }
    ])}`;
}

function profileUsageSection(meta) {
  const billingAction = meta.tier.key === "free" ? "open-plans" : "manage-billing";
  return `${profileHeader("Usage", "Credits", "Track monthly, 5-hour, and weekly allowance from the latest account session.")}
    <section class="profile-usage-panel"><div class="profile-usage-line"><span>Monthly credits</span><strong>${formatCredits(meta.used)} of ${formatCredits(meta.allowance)}</strong></div><div class="${meta.allowance > 0 ? "credits-bar" : "credits-bar credits-bar--empty"}"><span style="width:${meta.pct}%"></span></div></section>
    <section class="profile-stat-grid profile-stat-grid--wide">${profileUsageStat("5-hour limit", meta.burstUsed, meta.burstCap)}${profileUsageStat("Weekly limit", meta.weeklyUsed, meta.weeklyCap)}</section>
    ${profileActionList([{ key: "billing", icon: "bolt", label: "Manage credits", detail: "Open plan and billing options.", action: billingAction }])}`;
}

function profileUsageStat(label, used, cap) {
  const value = cap > 0 ? `${formatCredits(used)} / ${formatCredits(cap)}` : "Not limited";
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
    <section class="profile-choice-list"><h2>Appearance</h2>${profileAppearanceOptions.map((opt) => profileChoiceButton("appearance", opt.key, opt.title, opt.detail, opt.icon, prefs.appearance === opt.key)).join("")}</section>
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

function profileInfoPanel(title, detail) {
  return `<section class="profile-info-panel"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></section>`;
}

function profileChoiceButton(group, value, title, detail, iconName, active) {
  return `<button class="profile-choice-row${active ? " active" : ""}" type="button" data-profile-action="set-pref" data-profile-key="${escapeAttribute(group)}" data-profile-value="${escapeAttribute(value)}"><span class="profile-row-icon">${icon(iconName)}</span><span class="profile-action-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span><span class="profile-choice-check">${active ? icon("check") : ""}</span></button>`;
}

function profileToggleList(rows) {
  return rows.map((row) => `<button class="profile-toggle-row${row.value ? " is-on" : ""}" type="button" data-profile-action="toggle-pref" data-profile-key="${escapeAttribute(row.key)}"><span class="profile-toggle"><span></span></span><span class="profile-action-copy"><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span></button>`).join("");
}

function profileSelectRow(label, key, options, value) {
  return `<label class="profile-select-row"><span>${escapeHtml(label)}</span><select data-profile-select="${escapeAttribute(key)}">${options.map((item) => `<option value="${escapeAttribute(item.key)}" ${value === item.key ? "selected" : ""}>${escapeHtml(item.label || item.title)}</option>`).join("")}</select></label>`;
}

function firstName(name) {
  const value = String(name || "").trim().split(/\s+/).filter(Boolean)[0];
  return value && value !== "Desktop" ? value : "";
}

function appearanceLabel(mode) {
  if (mode === "auto") return "Auto";
  if (mode === "light") return "Light";
  return "Dark";
}

function profileInfoTile(label, value, detail, section) {
  return `<button class="profile-info-tile" type="button" data-profile-section="${escapeAttribute(section)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></button>`;
}

function profileActionList(rows) {
  return `<section class="profile-action-list">${rows.map(profileActionRow).join("")}</section>`;
}

function profileActionRow(row) {
  const right = row.action ? `<span class="profile-row-chevron">${icon("chevron")}</span>` : "";
  const cls = `profile-action-row${row.danger ? " profile-action-row--danger" : ""}${row.action ? "" : " profile-action-row--static"}`;
  const action = row.action ? ` data-profile-action="${escapeAttribute(row.action)}"` : "";
  const value = row.value ? ` data-profile-value="${escapeAttribute(row.value)}"` : "";
  return `<button class="${cls}" type="button"${action} data-profile-key="${escapeAttribute(row.key)}"${value}><span class="profile-row-icon">${icon(row.icon)}</span><span class="profile-action-copy"><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail || "")}</small></span>${right}</button>`;
}
