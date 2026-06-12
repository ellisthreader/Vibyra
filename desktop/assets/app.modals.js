function openPairModal() {
  const opener = document.activeElement;
  showModal(nodes.pairModal, closePairModal, opener);
  renderPairModal();
}
function closePairModal() { hideModal(nodes.pairModal); }
function renderPairModal() {
  const pairStatus = currentState.pendingPair?.status;
  const paired = Boolean(currentState.pairedDevice);
  if (paired) {
    nodes.pairBody.innerHTML = pairingConnectedView(currentState.pairedDevice);
    document.getElementById("unpair-device")?.addEventListener("click", () => post("/desktop/disconnect"));
    return;
  }
  const code = String(currentState.pairCode || "------");
  const codeReady = code && code !== "------";
  const deviceName = currentState.pendingPair?.deviceName || "Vibyra Phone";
  if (pairStatus === "pending") {
    nodes.pairBody.innerHTML = pairingApprovalView(deviceName);
  } else if (pairStatus === "approved") {
    nodes.pairBody.innerHTML = pairingPhonePermissionView(deviceName);
  } else {
    nodes.pairBody.innerHTML = pairingWaitingView(code, codeReady && currentState.connectionUrls?.length);
  }
  document.getElementById("approve-pair")?.addEventListener("click", () => post("/desktop/approve"));
  document.getElementById("deny-pair")?.addEventListener("click", () => post("/desktop/deny"));
  document.getElementById("cancel-approved-pair")?.addEventListener("click", () => post("/desktop/deny"));
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
function openTokenModal(view, opener = document.activeElement) {
  tokenModalView = tokenModalViews.includes(view) ? view : "profile";
  showModal(nodes.tokenModal, closeTokenModal, opener, document.getElementById("open-account-menu"));
  renderTokenModal();
  if (tokenModalView === "plans" && typeof loadDesktopBillingCatalog === "function") void loadDesktopBillingCatalog();
  if (typeof refreshDesktopAccountSession === "function") {
    refreshDesktopAccountSession()
      .then(() => { if (nodes.tokenModal.classList.contains("open") && tokenModalView !== "plans") renderTokenModal(); })
      .catch(() => {});
  }
}
function closeTokenModal() {
  hideModal(nodes.tokenModal);
  tokenModalView = "profile";
}
function openProfileModal(focus = "profile", opener = document.activeElement) {
  profileSectionSearch = "";
  if (typeof setProfileFocus === "function") setProfileFocus(focus);
  if (typeof profileActiveSection !== "undefined") {
    const sections = typeof profileSections === "function" ? profileSections() : [];
    profileActiveSection = sections.some((section) => section.key === focus)
      ? focus
      : focus === "app" ? "app" : "profile";
  }
  profileModalOpen = true;
  topbarAccountMenuOpen = false;
  topbarChatMenuOpen = false;
  renderTopbar();
  showModal(nodes.profileModal, closeProfileModal, opener, document.getElementById("open-account-menu"));
  renderProfileModal();
  resetProfileModalScroll();
  requestAnimationFrame(() => resetProfileModalScroll());
}
function closeProfileModal() {
  profileModalOpen = false;
  profileSectionSearch = "";
  profileFocus = "";
  profileSessionMenuId = "";
  profileBillingPlanOpen = false;
  profileBillingManageOpen = false;
  profileBillingCancelOpen = false;
  hideModal(nodes.profileModal);
}
function resetProfileModalScroll() {
  if (nodes.profileBody) nodes.profileBody.scrollTop = 0;
}
function setTokenModalView(view) {
  tokenModalView = tokenModalViews.includes(view) ? view : "profile";
  renderTokenModal();
  if (tokenModalView === "plans" && typeof loadDesktopBillingCatalog === "function") void loadDesktopBillingCatalog();
}
function handleAccountAction(action) {
  const opener = document.activeElement;
  topbarAccountMenuOpen = false;
  if (action === "upgrade") {
    renderTopbar();
    openTokenModal("plans", opener);
    return;
  }
  if (action === "profile") {
    openProfileModal("profile", opener);
    return;
  }
  if (action === "settings") {
    openProfileModal("app", opener);
    return;
  }
  if (action === "help") {
    renderTopbar();
    openTokenModal("help", opener);
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
  const upgradeSection = tier.key === "free"
    ? `<div class="account-menu-section">
      <button type="button" data-account-action="upgrade">${icon("bolt")}<span>Upgrade plan</span></button>
    </div>`
    : "";
  return `<div class="topbar-menu account-menu" role="menu">
    <div class="account-menu-identity">${avatar}<div class="account-menu-copy"><strong>${escapeHtml(account.name || "Desktop account")}</strong><span>${escapeHtml(planLabel)}</span></div></div>
    ${upgradeSection}
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
  if (titleEl) titleEl.textContent = tokenModalView === "plans" && tier.key === "free"
    ? "Upgrade plan"
    : tokenModalTitles[tokenModalView] || "Profile";
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
