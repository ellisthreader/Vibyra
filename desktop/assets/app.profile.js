let profileFocus = "";

function setProfileFocus(focus) {
  profileFocus = focus || "";
}

function profileRowsAccount() {
  return [
    { key: "plan", icon: "card", label: "Plan & billing", action: "open-plans" },
    { key: "usage", icon: "pulse", label: "Usage", action: "open-usage" },
    { key: "info", icon: "user", label: "Profile information", action: "phone" },
    { key: "refer", icon: "sparkles", label: "Refer & earn", action: "phone" }
  ];
}

function profileRowsPreferences() {
  return [
    { key: "appearance", icon: "palette", label: "Appearance", action: "phone" },
    { key: "language", icon: "globe", label: "Language", action: "phone" },
    { key: "notifications", icon: "alert", label: "Notifications", action: "phone" },
    { key: "security", icon: "lock", label: "Privacy & security", action: "phone" }
  ];
}

function profileRowsSupport() {
  return [
    { key: "contact", icon: "send", label: "Contact support", action: "mailto" },
    { key: "help", icon: "help", label: "Help center", action: "open-help" },
    { key: "terms", icon: "document", label: "Terms of service", action: "phone" }
  ];
}

function profileRowsFooter() {
  return [
    { key: "clear", icon: "trash", label: "Clear local cache", action: "clear-cache", danger: true },
    { key: "logout", icon: "logout", label: "Log out", action: "logout", danger: true }
  ];
}

function renderProfileGroup(title, rows, options = {}) {
  const focused = options.focused ? " profile-group--focused" : "";
  const list = rows.map((row) => {
    const right = row.action === "phone"
      ? `<span class="profile-row-pill">Phone</span>`
      : `<span class="profile-row-chevron">${icon("chevron")}</span>`;
    const cls = `profile-row${row.danger ? " profile-row--danger" : ""}`;
    const settingHook = row.action === "logout" ? ` data-setting="Log out"` : "";
    return `<button class="${cls}" type="button" data-profile-action="${escapeAttribute(row.action)}" data-profile-key="${escapeAttribute(row.key)}"${settingHook}><span class="profile-row-icon">${icon(row.icon)}</span><span class="profile-row-label">${escapeHtml(row.label)}</span>${right}</button>`;
  }).join("");
  const heading = title ? `<p class="profile-group-title">${escapeHtml(title)}</p>` : "";
  return `<section class="profile-group${focused}">${heading}<div class="profile-group-rows">${list}</div></section>`;
}

function renderProfileHero() {
  const account = currentAccount();
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const tier = currentPlanTier();
  const cycle = account.planBillingCycle === "annual" ? "annual" : "monthly";
  const planLabel = `${tier.name}${cycle === "annual" && tier.key !== "free" ? " annual" : ""}`;
  const avatarSrc = accountImageUrl(user, account);
  const initials = accountInitials(account.name);
  const avatar = avatarSrc
    ? `<img class="profile-hero-avatar" src="${escapeAttribute(avatarSrc)}" alt="" />`
    : `<span class="profile-hero-avatar profile-hero-avatar--initials" aria-hidden="true">${escapeHtml(initials)}</span>`;
  const allowance = Number(account.monthlyCredits || (cycle === "annual" ? tier.annualCredits : tier.monthlyCredits));
  const used = Number(account.creditsUsed ?? 0);
  const pct = allowance > 0 ? Math.min(100, Math.max(0, Math.round((used / allowance) * 100))) : 0;
  const barClass = allowance > 0 ? "credits-bar" : "credits-bar credits-bar--empty";
  const email = account.email ? `<span class="profile-hero-email">${escapeHtml(account.email)}</span>` : "";
  return `<section class="profile-hero">
    <div class="profile-hero-identity">${avatar}<div class="profile-hero-copy"><h1>${escapeHtml(account.name || "Desktop account")}</h1>${email}</div><span class="profile-hero-plan">${escapeHtml(planLabel)}</span></div>
    <div class="profile-hero-credits"><p class="credits-line"><span>${formatCredits(used)} of ${formatCredits(allowance)} monthly credits</span></p><div class="${barClass}"><span style="width:${pct}%"></span></div></div>
  </section>`;
}

function renderProfile() {
  if (!nodes.content) return;
  const focusPrefs = profileFocus === "preferences";
  nodes.content.innerHTML = `<div class="profile-page">${renderProfileHero()}${renderProfileGroup("Account", profileRowsAccount())}${renderProfileGroup("Preferences", profileRowsPreferences(), { focused: focusPrefs })}${renderProfileGroup("Support", profileRowsSupport())}${renderProfileGroup("", profileRowsFooter())}<p class="profile-page-foot">Most personalization, account edits, and security live on your phone. Open Vibyra on your phone to change them.</p></div>`;
  document.querySelectorAll("[data-profile-action]").forEach((button) => button.addEventListener("click", () => handleProfileRow(button.dataset.profileAction, button.dataset.profileKey)));
  if (focusPrefs) {
    requestAnimationFrame(() => {
      document.querySelector(".profile-group--focused")?.scrollIntoView({ behavior: "smooth", block: "start" });
      profileFocus = "";
    });
  }
}

function handleProfileRow(action, key) {
  if (action === "open-plans") { openTokenModal("plans"); return; }
  if (action === "open-usage") { openTokenModal("profile"); return; }
  if (action === "open-help") { openTokenModal("help"); return; }
  if (action === "mailto") { window.open("mailto:support@vibyra.app?subject=Vibyra%20Desktop%20support", "_blank", "noopener"); return; }
  if (action === "clear-cache") { confirmClearDesktopCache(); return; }
  if (action === "logout") { return; }
  if (action === "phone") { showPhoneNotice(key); return; }
}

function confirmClearDesktopCache() {
  const ok = window.confirm("Clear local Vibyra cache? This removes desktop chat history, drafts, and UI state on this computer. Your account stays signed in.");
  if (!ok) return;
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("vibyra.desktop.") && k !== "vibyra.desktop.auth")
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  recentChats = [];
  activeChatId = "";
  chatMessages = [];
  chatDraft = "";
  chatAttachments = [];
  render();
}

function showPhoneNotice(key) {
  const row = document.querySelector(`[data-profile-key="${key}"]`);
  if (!row) return;
  if (row.dataset.noticeOpen === "1") return;
  row.dataset.noticeOpen = "1";
  const notice = document.createElement("p");
  notice.className = "profile-row-notice";
  notice.textContent = "Open Vibyra on your phone to change this.";
  row.insertAdjacentElement("afterend", notice);
  setTimeout(() => { notice.remove(); row.dataset.noticeOpen = ""; }, 2400);
}
