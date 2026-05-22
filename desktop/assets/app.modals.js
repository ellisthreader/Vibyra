function openPairModal() { nodes.pairModal.classList.add("open"); renderPairModal(); }
function closePairModal() { nodes.pairModal.classList.remove("open"); }
function renderPairModal() {
  const pending = currentState.pendingPair && currentState.pendingPair.status === "pending";
  const paired = Boolean(currentState.pairedDevice);
  if (paired) {
    nodes.pairBody.innerHTML = `<section class="pair-v2 pair-v2-paired"><span class="pair-v2-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7.5"/></svg></span><p class="pair-v2-connected">Connected to ${escapeHtml(currentState.pairedDevice)}</p><button type="button" class="pair-v2-unpair" id="unpair-device">Unpair</button></section>`;
    document.getElementById("unpair-device")?.addEventListener("click", () => post("/desktop/disconnect"));
    return;
  }
  const code = String(currentState.pairCode || "------");
  const codeReady = code && code !== "------";
  nodes.pairBody.innerHTML = `<section class="pair-v2"><button type="button" class="pair-v2-code" id="copy-pair-code" data-copy-pair-code aria-label="Copy pair code" ${codeReady ? "" : "disabled"}><span class="pair-v2-code-text">${escapeHtml(code)}</span><span class="pair-v2-copied" aria-hidden="true">Copied</span></button><p class="pair-v2-status"><span class="pair-v2-dot" aria-hidden="true"></span><span>Waiting for your phone…</span></p><p class="pair-v2-hint">Open Vibyra on your phone and enter this code.</p>${pending ? `<div class="pair-v2-approval"><span class="pair-v2-approval-icon">${icon("phone")}</span><div class="pair-v2-approval-copy"><strong>${escapeHtml(currentState.pendingPair.deviceName || "Vibyra Phone")}</strong><span>Approve only if this is your phone.</span></div><div class="pair-v2-approval-actions"><button class="danger-button" id="deny-pair" type="button" ${posting ? "disabled" : ""}>Deny</button><button class="primary-button" id="approve-pair" type="button" ${posting ? "disabled" : ""}>Allow</button></div></div>` : ""}</section>`;
  document.getElementById("approve-pair")?.addEventListener("click", () => post("/desktop/approve"));
  document.getElementById("deny-pair")?.addEventListener("click", () => post("/desktop/deny"));
  const copyButton = document.getElementById("copy-pair-code");
  copyButton?.addEventListener("click", async () => {
    if (!codeReady) return;
    try { await navigator.clipboard.writeText(code); } catch {}
    copyButton.classList.add("is-copied");
    setTimeout(() => copyButton.classList.remove("is-copied"), 1500);
  });
}
const tokenModalViews = ["profile", "plans", "help"];
const tokenModalTitles = { profile: "Profile", plans: "Change plan", help: "Help" };
function openTokenModal(view) {
  tokenModalView = tokenModalViews.includes(view) ? view : "profile";
  nodes.tokenModal.classList.add("open");
  renderTokenModal();
  if (typeof refreshDesktopAccountSession === "function") {
    refreshDesktopAccountSession()
      .then(() => { if (nodes.tokenModal.classList.contains("open") && tokenModalView !== "plans") renderTokenModal(); })
      .catch(() => {});
  }
}
function closeTokenModal() {
  nodes.tokenModal.classList.remove("open");
  tokenModalView = "profile";
}
function openProfileModal(focus = "") {
  profileSectionSearch = "";
  if (typeof setProfileFocus === "function") setProfileFocus(focus);
  profileModalOpen = true;
  topbarAccountMenuOpen = false;
  topbarChatMenuOpen = false;
  nodes.profileModal.classList.add("open");
  renderTopbar();
  renderProfileModal();
  resetProfileModalScroll();
  requestAnimationFrame(() => resetProfileModalScroll());
}
function closeProfileModal() {
  profileModalOpen = false;
  profileSectionSearch = "";
  profileFocus = "";
  profileSessionMenuId = "";
  nodes.profileModal.classList.remove("open");
}
function resetProfileModalScroll() {
  if (nodes.profileBody) nodes.profileBody.scrollTop = 0;
}
function setTokenModalView(view) {
  tokenModalView = tokenModalViews.includes(view) ? view : "profile";
  renderTokenModal();
}
function handleAccountAction(action) {
  topbarAccountMenuOpen = false;
  if (action === "upgrade") {
    renderTopbar();
    const tier = currentPlanTier();
    if (tier.key === "free") openTokenModal("plans");
    else manageDesktopBilling();
    return;
  }
  if (action === "profile") {
    openProfileModal("");
    return;
  }
  if (action === "settings") {
    openProfileModal("preferences");
    return;
  }
  if (action === "help") {
    renderTopbar();
    openTokenModal("help");
    return;
  }
  if (action === "logout") {
    renderTopbar();
    if (typeof desktopSignOut === "function") desktopSignOut();
  }
}
function accountMenu() {
  const account = currentAccount();
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const tier = currentPlanTier();
  const cycle = account.planBillingCycle === "annual" ? "annual" : "monthly";
  const planLabel = `${tier.name}${cycle === "annual" && tier.key !== "free" ? " annual" : ""} plan`;
  const avatarSrc = accountImageUrl(user, account);
  const initials = accountInitials(account.name);
  const avatar = avatarSrc
    ? `<img class="account-menu-avatar" src="${escapeAttribute(avatarSrc)}" alt="" />`
    : `<span class="account-menu-avatar account-menu-avatar--initials" aria-hidden="true">${escapeHtml(initials)}</span>`;
  const upgradeLabel = tier.key === "free" ? "Upgrade plan" : "Manage billing";
  return `<div class="topbar-menu account-menu" role="menu">
    <div class="account-menu-identity">${avatar}<div class="account-menu-copy"><strong>${escapeHtml(account.name || "Desktop account")}</strong><span>${escapeHtml(planLabel)}</span></div></div>
    <div class="account-menu-section">
      <button type="button" data-account-action="upgrade">${icon("bolt")}<span>${escapeHtml(upgradeLabel)}</span></button>
    </div>
    <div class="account-menu-section">
      <button type="button" data-account-action="profile">${icon("user")}<span>Profile</span></button>
      <button type="button" data-account-action="settings">${icon("palette")}<span>Settings</span></button>
      <button type="button" data-account-action="help">${icon("help")}<span>Help</span></button>
    </div>
    <div class="account-menu-section">
      <button class="danger" type="button" data-account-action="logout">${icon("logout")}<span>Log out</span></button>
    </div>
  </div>`;
}
function renderTokenModal() {
  const account = currentAccount();
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const tier = currentPlanTier();
  const cycle = account.planBillingCycle === "annual" ? "annual" : "monthly";
  const allowance = Number(account.monthlyCredits || (cycle === "annual" ? tier.annualCredits : tier.monthlyCredits));
  const used = Number(account.creditsUsed ?? 0);
  const dailyCap = Number(account.dailyCreditsCap || tier.dailyCap || 0);
  const dailyUsed = Number(account.dailyCreditsUsed || 0);
  const planLabel = `${tier.name}${cycle === "annual" && tier.key !== "free" ? " annual" : ""}`;
  const modalEl = nodes.tokenModal.querySelector(".modal");
  if (modalEl) modalEl.classList.toggle("modal--narrow", tokenModalView !== "plans");
  if (modalEl) modalEl.classList.toggle("modal--billing-revamp", tokenModalView === "plans");
  const titleEl = document.getElementById("token-title");
  if (titleEl) titleEl.textContent = tokenModalTitles[tokenModalView] || "Profile";
  if (tokenModalView === "plans") {
    nodes.tokenBody.innerHTML = renderPlanPicker(tier.key, cycle);
  } else if (tokenModalView === "help") {
    nodes.tokenBody.innerHTML = `<section class="account-help"><p class="credits-line">Need a hand?</p><a class="account-help-link" href="mailto:support@vibyra.app?subject=Vibyra%20Desktop%20support" target="_blank" rel="noopener">${icon("send")}<span>Email support@vibyra.app</span></a><p class="credits-daily">For account, billing, and preferences, use the desktop Settings page or email support.</p></section>`;
  } else {
    const avatarSrc = accountImageUrl(user, account);
    const initials = accountInitials(account.name);
    const avatar = avatarSrc
      ? `<img class="account-avatar" src="${escapeAttribute(avatarSrc)}" alt="" />`
      : `<span class="account-avatar account-avatar--initials" aria-hidden="true">${escapeHtml(initials)}</span>`;
    const pct = allowance > 0 ? Math.min(100, Math.max(0, Math.round((used / allowance) * 100))) : 0;
    const barClass = allowance > 0 ? "credits-bar" : "credits-bar credits-bar--empty";
    const dailyShow = dailyCap > 0 && dailyUsed / dailyCap > 0.8;
    const dailyLine = dailyShow ? `<p class="credits-daily">Daily cap: ${formatCredits(dailyUsed)} / ${formatCredits(dailyCap)}</p>` : "";
    nodes.tokenBody.innerHTML = `<section class="account-identity">${avatar}<div class="account-identity-copy"><strong>${escapeHtml(account.name || "Desktop account")}</strong><span>${escapeHtml(planLabel)}</span></div></section><section class="account-credits"><p class="credits-line"><span>${formatCredits(used)} of ${formatCredits(allowance)} monthly credits</span></p><div class="${barClass}"><span style="width:${pct}%"></span></div>${dailyLine}</section>`;
  }
  document.querySelectorAll("[data-token-view]").forEach((button) => button.addEventListener("click", () => setTokenModalView(button.dataset.tokenView)));
  if (typeof bindPlanPickerControls === "function") bindPlanPickerControls();
  document.querySelectorAll("[data-billing-plan]").forEach((button) => button.addEventListener("click", () => startDesktopBilling(button.dataset.billingPlan)));
}
function manageDesktopBilling() {
  if (typeof openDesktopBillingPortal === "function") openDesktopBillingPortal();
}
