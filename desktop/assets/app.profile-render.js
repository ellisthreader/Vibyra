function renderProfile(options = {}) {
  const target = profileRenderTarget();
  if (!target) return;
  const sections = profileSections();
  if (!sections.some((section) => section.key === profileActiveSection)) profileActiveSection = "profile";
  const meta = profileAccountMeta();
  const existingPage = options.reset ? null : target.querySelector(".profile-page--desktop");
  const detail = existingPage?.querySelector(".profile-detail");
  if (existingPage && detail) {
    detail.innerHTML = renderProfileDetail(profileActiveSection, meta);
    syncProfileSectionRail(existingPage, sections);
    bindProfileControls(target);
  } else {
    target.innerHTML = `<div class="profile-page profile-page--desktop">
      <aside class="profile-section-rail" aria-label="Settings sections">${renderProfileSectionRail(sections)}</aside>
      <main class="profile-detail" tabindex="-1">${renderProfileDetail(profileActiveSection, meta)}</main>
    </div>`;
    bindProfileControls(target);
  }
  if (profileActiveSection === "devices" && typeof ensureDesktopSessions === "function") ensureDesktopSessions();
  if (profileActiveSection === "app" && typeof ensureProfileScreenshotSettings === "function") {
    void ensureProfileScreenshotSettings();
  }
  profileFocus = "";
}

function renderProfileModal() { renderProfile({ reset: true }); }

function profileRenderTarget() {
  if (typeof nodes === "undefined") return null;
  if (nodes.profileModal?.classList.contains("open") && nodes.profileBody) return nodes.profileBody;
  return null;
}

function renderProfileSectionRail(sections) {
  const items = sections.map((section) => {
    const active = section.key === profileActiveSection;
    return `<button class="profile-section-button${active ? " active" : ""}" type="button"
      data-profile-section="${escapeAttribute(section.key)}" aria-current="${active ? "page" : "false"}">
      ${icon(section.icon)}<span>${escapeHtml(section.label)}</span>
    </button>`;
  }).join("");
  return `<div class="profile-section-card"><nav class="profile-section-list">${items}</nav></div>`;
}

function syncProfileSectionRail(root, sections) {
  root.querySelectorAll("[data-profile-section]").forEach((button) => {
    const active = sections.some((item) => item.key === button.dataset.profileSection)
      && button.dataset.profileSection === profileActiveSection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function renderProfileDetail(section, meta) {
  const renderers = {
    app: () => settingsAppSection(),
    billing: () => profileBillingSection(meta),
    devices: () => settingsDevicesSection(meta),
    help: () => settingsHelpSection(),
    personalization: () => settingsPersonalizationSection(meta),
    profile: () => settingsProfileSection(meta)
  };
  return (renderers[section] || renderers.profile)();
}

function profileInfoPanel(title, detail) {
  return `<section class="profile-info-panel"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></section>`;
}

function renderAppearancePanel(value) {
  return `<section class="profile-choice-list profile-appearance-section"><h2>Appearance</h2>${renderAppearancePicker(value)}</section>`;
}

function renderAppearancePicker(value) {
  const previews = [
    { key: "dark", title: "Dark", image: "/desktop/assets/profile-appearance-dark.png" },
    { key: "light", title: "Light", image: "/desktop/assets/profile-appearance-light.png" },
    { key: "auto", title: "System", image: "/desktop/assets/profile-appearance-auto.png" }
  ];
  return `<div class="profile-appearance-grid">${previews.map((item) => {
    const active = value === item.key;
    return `<button class="profile-appearance-card${active ? " active" : ""}" type="button"
      data-profile-action="set-pref" data-profile-key="appearance" data-profile-value="${item.key}"
      aria-pressed="${active}"><span class="profile-appearance-preview profile-appearance-preview--${item.key}">
      <img src="${item.image}" alt="" loading="eager" decoding="async" data-profile-appearance-image /></span>
      <strong>${item.title}</strong><span class="profile-appearance-check" aria-hidden="true">${icon("check")}</span></button>`;
  }).join("")}</div>`;
}

function profileSelectField(label, id, options, value) {
  return `<div class="profile-field"><span>${escapeHtml(label)}</span>${customSelectHtml({
    id, ariaLabel: label, value, options: profileDropdownOptions(options)
  })}</div>`;
}

function profileSelectRow(label, key, options, value) {
  return `<div class="profile-select-row"><span>${escapeHtml(label)}</span>${customSelectHtml({
    id: `profile-select-${key}`,
    ariaLabel: label,
    value,
    options: profileDropdownOptions(options),
    inputAttributes: { "data-profile-select": key }
  })}</div>`;
}

function profileDropdownOptions(options) {
  return options.map((item) => ({ value: item.value ?? item.key, label: item.label || item.title }));
}

function firstName(name) {
  const value = String(name || "").trim().split(/\s+/).filter(Boolean)[0];
  return value && value !== "Desktop" ? value : "";
}

function profileActionList(rows) {
  return `<section class="profile-action-list">${rows.map(profileActionRow).join("")}</section>`;
}

function profileActionRow(row) {
  const action = row.action ? ` data-profile-action="${escapeAttribute(row.action)}"` : "";
  const value = row.value ? ` data-profile-value="${escapeAttribute(row.value)}"` : "";
  const disabled = row.disabled ? " disabled" : "";
  return `<button class="profile-action-row${row.danger ? " profile-action-row--danger" : ""}${row.action ? "" : " profile-action-row--static"}"
    type="button"${action} data-profile-key="${escapeAttribute(row.key)}"${value}${disabled}>
    <span class="profile-row-icon">${icon(row.icon)}</span><span class="profile-action-copy">
    <strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail || "")}</small></span>
    ${row.action ? `<span class="profile-row-chevron">${icon("chevron")}</span>` : ""}</button>`;
}
