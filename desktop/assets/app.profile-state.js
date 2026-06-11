let profileFocus = "";
let profileModalOpen = false;
let profileSectionSearch = "";
const profileSectionKey = "vibyra.desktop.profileSection";
const profilePrefsKey = "vibyra.desktop.profilePreferences";
const profileSectionAliases = {
  account: "devices",
  general: "profile",
  preferences: "app",
  privacy: "devices",
  support: "help"
};
const storedProfileSection = localStorage.getItem(profileSectionKey) || "profile";
let profileActiveSection = profileSectionAliases[storedProfileSection] || storedProfileSection;
let profileFormMessage = "";
let profileFormBusy = false;
let profileBillingBusy = false;
let profileBillingMessage = "";
let profileBillingMessageDanger = false;
let profileBillingPlanOpen = false;
let profileBillingManageOpen = false;
let profileBillingCancelOpen = false;
let profileBillingCancelBusy = false;
let profileBillingCancelMessage = "";
let profileBillingCancelDanger = false;
let profileDeleteBusy = false;
let profileDeleteMessage = "";
let profileDeleteOpen = false;
let profileSessions = [];
let profileSessionsError = "";
let profileSessionsLoaded = false;
let profileSessionsLoading = false;
let profileSessionBusyId = "";
let profileSessionMenuId = "";
let profileLogoutAllBusy = false;
let profileConfirmAction = "";

const desktopPreferenceDefaults = {
  appearance: "dark",
  callName: "",
  chatFont: "vibyra-sans",
  customInstructions: "",
  responseStyle: "balanced",
  voice: "marin",
  voiceSpeed: 1,
  workOther: "",
  workType: "other"
};
const profileWorkOptions = [
  { key: "software", label: "Software and product" },
  { key: "design", label: "Design and creative" },
  { key: "founder", label: "Founder or operator" },
  { key: "student", label: "Student or researcher" },
  { key: "other", label: "Other" }
];
const profileResponseStyleOptions = [
  { key: "balanced", label: "Balanced", prompt: "Balanced: be clear and direct, with enough context to make decisions." },
  { key: "concise", label: "Concise", prompt: "Concise: answer briefly, lead with the result, and avoid extra explanation unless needed." },
  { key: "detailed", label: "Detailed", prompt: "Detailed: explain reasoning, tradeoffs, and next steps with useful context." },
  { key: "code-first", label: "Code-first", prompt: "Code-first: prioritize concrete implementation details, file references, and verification steps." }
];
const profileChatFontOptions = [
  { key: "vibyra-sans", label: "Vibyra Sans" },
  { key: "vibyra-serif", label: "Vibyra Serif" },
  { key: "system", label: "System" },
  { key: "mono", label: "Mono" }
];
function setProfileFocus(focus) {
  profileFocus = focus || "";
  if (profileFocus === "preferences" || profileFocus === "app") profileActiveSection = "app";
  if (profileFocus === "profile" || profileFocus === "general") profileActiveSection = "profile";
}

function profileSections() {
  return [
    { key: "profile", icon: "user", label: "Profile" },
    { key: "personalization", icon: "sparkles", label: "Personalization" },
    { key: "app", icon: "palette", label: "App" },
    { key: "devices", icon: "desktop", label: "Devices & privacy" },
    { key: "billing", icon: "bolt", label: "Billing" },
    { key: "help", icon: "help", label: "Help" }
  ];
}

function desktopPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(profilePrefsKey) || "{}");
    return { ...desktopPreferenceDefaults, ...parsed };
  } catch {
    return { ...desktopPreferenceDefaults };
  }
}

function saveDesktopPreferences(next) {
  localStorage.setItem(profilePrefsKey, JSON.stringify(next));
  applyDesktopPreferences(next);
}

function applyDesktopPreferences(next = desktopPreferences()) {
  if (!document.body) return;
  const appearance = next.appearance || "dark";
  const chatFont = next.chatFont || "vibyra-sans";
  if (document.body.dataset.desktopTheme !== appearance) document.body.dataset.desktopTheme = appearance;
  if (document.body.dataset.chatFont !== chatFont) document.body.dataset.chatFont = chatFont;
}

function desktopProfileContext() {
  const prefs = desktopPreferences();
  const work = prefs.workType === "other" && prefs.workOther ? prefs.workOther : profileWorkOptions.find((item) => item.key === prefs.workType)?.label || "";
  const responseStyle = profileResponseStyleOptions.find((item) => item.key === prefs.responseStyle)?.prompt || "";
  return {
    callName: String(prefs.callName || "").trim(),
    customInstructions: String(prefs.customInstructions || "").trim(),
    responseStyle,
    work
  };
}

function profileAccountMeta() {
  const account = currentAccount();
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const tier = currentPlanTier();
  const cycle = account.planBillingCycle === "annual" ? "annual" : "monthly";
  const allowance = Number(account.monthlyCredits || (cycle === "annual" ? tier.annualCredits : tier.monthlyCredits));
  const used = Number(account.creditsUsed ?? 0);
  const pct = allowance > 0 ? Math.min(100, Math.max(0, Math.round((used / allowance) * 100))) : 0;
  return {
    account,
    avatarSrc: accountImageUrl(user, account),
    allowance,
    burstCap: Number(account.burstCreditsCap || 0),
    burstUsed: Number(account.burstCreditsUsed || 0),
    billingCurrency: account.billingCurrency || "gbp",
    billingProvider: account.billingProvider || "",
    billingVatInclusive: account.billingVatInclusive !== false,
    canManageStripeBilling: Boolean(account.canManageStripeBilling),
    cycle,
    creditsResetAt: account.creditsResetAt || account.planRenewsAt || null,
    membershipEndsAt: account.membershipEndsAt || null,
    membershipCancelAtPeriodEnd: Boolean(account.membershipCancelAtPeriodEnd),
    email: account.email || "",
    name: account.name || "Desktop account",
    pct,
    planLabel: `${tier.name}${cycle === "annual" && tier.key !== "free" ? " annual" : ""}`,
    planPricePence: Number(account.planPricePence || 0),
    tier,
    used,
    weeklyCap: Number(account.weeklyCreditsCap || 0),
    weeklyUsed: Number(account.weeklyCreditsUsed || 0)
  };
}

function profileAvatar(meta, size = "large") {
  const cls = size === "small" ? "profile-nav-avatar" : "profile-detail-avatar";
  return meta.avatarSrc
    ? `<img class="${cls}" src="${escapeAttribute(meta.avatarSrc)}" alt="" />`
    : `<span class="${cls} ${cls}--initials" aria-hidden="true">${escapeHtml(accountInitials(meta.name))}</span>`;
}

if (document.body) {
  applyDesktopPreferences();
} else {
  document.addEventListener("DOMContentLoaded", () => applyDesktopPreferences(), { once: true });
}
